//! Finished videos onto the disk the person chooses. The editor renders in the window; the file comes here and
//! is written where the system "Save as" dialog says (by default the Videos folder), or into `data/exports`
//! when an agent exports. A saved file can be shown in the file manager.

use std::path::{Path, PathBuf};

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{post, put};
use axum::{Json, Router};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::json;
use tokio::io::AsyncWriteExt;

use crate::AppState;

/// A file name without folders or characters Windows refuses.
fn clean_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').to_string();
    if cleaned.is_empty() { "AI-Cut-export.mp4".into() } else { cleaned }
}

/// `name` in `dir`, numbered when the name is taken.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, extension) = match name.rsplit_once('.') {
        Some((stem, extension)) => (stem.to_string(), format!(".{extension}")),
        None => (name.to_string(), String::new()),
    };
    (2..10_000).map(|n| dir.join(format!("{stem} ({n}){extension}"))).find(|path| !path.exists()).unwrap_or(candidate)
}

fn bad(status: StatusCode, message: String) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

#[derive(Deserialize)]
pub struct SaveQuery {
    name: String,
    /// Ask where to save with the system dialog.
    #[serde(default)]
    dialog: bool,
    /// Save next to this file (a subtitle beside its video) instead of asking.
    #[serde(default)]
    beside: Option<String>,
    /// Save into this folder. A folder that no longer exists falls back to the default one.
    #[serde(default)]
    dir: Option<String>,
}

/// Where exports go when the person has not chosen a folder: their Documents, then Videos, then
/// the workspace exports folder. A remembered folder can disappear (unplugged disk, deleted
/// folder), so every save has a destination that still works.
fn default_export_dir(exports: &Path) -> PathBuf {
    dirs::document_dir()
        .filter(|dir| dir.is_dir())
        .or_else(|| dirs::video_dir().filter(|dir| dir.is_dir()))
        .unwrap_or_else(|| exports.to_path_buf())
}

async fn save(State(state): State<AppState>, Query(query): Query<SaveQuery>, body: Body) -> Response {
    let name = clean_name(&query.name);
    let exports = state.data.join("exports");
    if let Err(error) = tokio::fs::create_dir_all(&exports).await {
        return bad(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    let partial = exports.join(format!(".{}.partial", uuid::Uuid::new_v4().simple()));
    let written = async {
        let mut file = tokio::fs::File::create(&partial).await?;
        let mut stream = body.into_data_stream();
        while let Some(chunk) = stream.next().await {
            file.write_all(&chunk.map_err(std::io::Error::other)?).await?;
        }
        file.flush().await?;
        std::io::Result::Ok(())
    }
    .await;
    if let Err(error) = written {
        let _ = tokio::fs::remove_file(&partial).await;
        return bad(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    let mut fell_back = false;
    let target = if let Some(beside) = query.beside.as_deref().filter(|beside| !beside.is_empty()) {
        let Some(dir) = Path::new(beside).parent().filter(|dir| dir.is_dir()) else {
            let _ = tokio::fs::remove_file(&partial).await;
            return bad(StatusCode::BAD_REQUEST, t!("exports-no-folder", path = beside.to_string()));
        };
        free_path(dir, &name)
    } else if let Some(dir) = query.dir.as_deref().filter(|dir| !dir.trim().is_empty()) {
        let requested = PathBuf::from(dir);
        let usable = if requested.is_dir() {
            true
        } else {
            tokio::fs::create_dir_all(&requested).await.is_ok() && requested.is_dir()
        };
        let dir = if usable {
            requested
        } else {
            fell_back = true;
            default_export_dir(&exports)
        };
        free_path(&dir, &name)
    } else if query.dialog {
        let start = dirs::video_dir().filter(|dir| dir.is_dir()).unwrap_or_else(|| exports.clone());
        let chosen = rfd::AsyncFileDialog::new().set_directory(&start).set_file_name(&name).set_title(t!("exports-dialog-title")).save_file().await;
        match chosen {
            Some(handle) => handle.path().to_path_buf(),
            None => {
                let _ = tokio::fs::remove_file(&partial).await;
                return Json(json!({ "cancelled": true })).into_response();
            }
        }
    } else {
        free_path(&exports, &name)
    };
    let moved = match tokio::fs::rename(&partial, &target).await {
        Ok(()) => Ok(()),
        // another disk: copy, then let the partial go
        Err(_) => tokio::fs::copy(&partial, &target).await.map(|_| ()).and(tokio::fs::remove_file(&partial).await),
    };
    if let Err(error) = moved {
        let _ = tokio::fs::remove_file(&partial).await;
        return bad(StatusCode::INTERNAL_SERVER_ERROR, format!("{}: {error}", target.display()));
    }
    crate::hub::count("export_done");
    Json(json!({ "path": target.display().to_string(), "fallback": fell_back })).into_response()
}

#[derive(Deserialize)]
pub struct RevealBody {
    path: String,
}

/// Explorer's `/select,` argument. The path must be quoted inside this one argument: Explorer
/// parses its own command line, and an unquoted path with spaces ("Тося пьет кофе.mp4") makes it
/// open the Documents folder instead of selecting the file.
#[cfg(windows)]
fn reveal_argument(path: &Path) -> String {
    format!("/select,\"{}\"", path.display())
}

/// `explorer /select,"<path>"`, passed verbatim: Explorer parses its own command line, so the
/// usual argument escaping would escape these quotes and lose the path.
#[cfg(windows)]
fn reveal_command(path: &Path) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    let mut command = std::process::Command::new("explorer");
    command.raw_arg(reveal_argument(path));
    command
}

#[cfg(target_os = "macos")]
fn reveal_command(path: &Path) -> std::process::Command {
    let mut command = std::process::Command::new("open");
    command.arg("-R").arg(path);
    command
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_command(path: &Path) -> std::process::Command {
    let mut command = std::process::Command::new("xdg-open");
    command.arg(path.parent().unwrap_or(path));
    command
}

/// Opens a file with the program registered for it: Explorer on Windows hands it to the shell,
/// `open` and `xdg-open` do the same elsewhere.
#[cfg(windows)]
fn open_command(path: &Path) -> std::process::Command {
    let mut command = std::process::Command::new("explorer");
    command.arg(path);
    command
}

#[cfg(not(windows))]
fn open_command(path: &Path) -> std::process::Command {
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    let mut command = std::process::Command::new(opener);
    command.arg(path);
    command
}

/// Shows a file in the file manager, selected.
async fn reveal(Json(body): Json<RevealBody>) -> Response {
    let path = PathBuf::from(&body.path);
    if !path.exists() {
        return bad(StatusCode::NOT_FOUND, t!("exports-no-file", path = body.path.clone()));
    }
    let mut command = reveal_command(&path);
    match crate::process_group::detach_from_group(&mut command).spawn() {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => bad(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

#[derive(Deserialize)]
pub struct PickQuery {
    /// Folder the picker opens in (the remembered export folder).
    #[serde(default)]
    start: Option<String>,
}

/// The system folder picker, used to choose the export destination before rendering.
async fn pick_folder(Query(query): Query<PickQuery>) -> Response {
    let mut dialog = rfd::AsyncFileDialog::new().set_title(t!("exports-dialog-title"));
    if let Some(start) = query.start.filter(|start| Path::new(start).is_dir()) {
        dialog = dialog.set_directory(start);
    }
    match dialog.pick_folder().await {
        Some(handle) => Json(json!({ "path": handle.path().display().to_string() })).into_response(),
        None => Json(json!({ "cancelled": true })).into_response(),
    }
}

/// Opens a saved file in the system's default program.
async fn open_file(Json(body): Json<RevealBody>) -> Response {
    let path = PathBuf::from(&body.path);
    if !path.exists() {
        return bad(StatusCode::NOT_FOUND, t!("exports-no-file", path = body.path.clone()));
    }
    let mut command = open_command(&path);
    match crate::process_group::detach_from_group(&mut command).spawn() {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => bad(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/exports", put(save))
        .route("/api/reveal", post(reveal))
        .route("/api/open", post(open_file))
        .route("/api/pick-folder", post(pick_folder))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_lose_folders_and_forbidden_characters() {
        assert_eq!(clean_name("../a:b?.mp4"), ".._a_b_.mp4".trim_matches('.'));
        assert_eq!(clean_name("  "), "AI-Cut-export.mp4");
        assert_eq!(clean_name("Клип 1.mp4"), "Клип 1.mp4");
    }

    /// A file name with spaces used to make Explorer open the Documents folder instead: the
    /// switch and its quoted path must travel as one raw argument.
    #[cfg(windows)]
    #[test]
    fn reveal_argument_quotes_the_path() {
        let path = Path::new(
            r"C:\AI-Cut\data\workspace\projects\qYSKEHhx\exports\Тося пьет кофе и танцует.mp4",
        );
        assert_eq!(
            reveal_argument(path),
            r#"/select,"C:\AI-Cut\data\workspace\projects\qYSKEHhx\exports\Тося пьет кофе и танцует.mp4""#
        );
    }
}
