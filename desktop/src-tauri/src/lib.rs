//! Tauri shell of AI-Cut. It does nothing heavy itself: it runs `vs-server` (axum) inside this process on
//! 127.0.0.1:8796 (`AICUT_PORT`) and opens the window on that URL. The server serves the window and the API
//! on one origin, and the fixed port keeps that origin, with the window's storage and the agents' address,
//! the same between runs. When AI-Cut already answers on the port the window opens on it; a second start of
//! the release build gives focus to the window already open.
//!
//! Where resources, data, the WebView2 profile and temporary files live is decided by `layout`.

mod layout;

use std::sync::mpsc::{Receiver, TryRecvError};
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use vs_server::service::{self, Claim};

fn wait_for_own_service(port: u16, stopped: &Receiver<Result<(), String>>) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if service::wait_until_serving(port, Duration::from_millis(500)) {
            return Ok(());
        }
        match stopped.try_recv() {
            Ok(Err(e)) => return Err(vs_server::i18n::text("shell-server-failed", &[("error", e)])),
            Ok(Ok(())) => return Err(vs_server::i18n::text("shell-server-stopped", &[])),
            Err(TryRecvError::Disconnected) => return Err(vs_server::i18n::text("shell-server-crashed", &[])),
            Err(TryRecvError::Empty) => {}
        }
        if Instant::now() >= deadline {
            return Err(vs_server::i18n::text("shell-server-silent", &[("port", port.to_string())]));
        }
    }
}

/// There is no window yet and the console is hidden: a native dialog is the only way to say why.
fn fatal(message: &str) {
    eprintln!("[ERROR] {message}");
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title("AI-Cut")
        .set_description(message)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

fn open_in_browser(app: &tauri::AppHandle, url: &tauri::Url) {
    use tauri_plugin_opener::OpenerExt;
    if let Err(e) = app.opener().open_url(url.as_str(), None::<&str>) {
        eprintln!("[ERROR] the link {url} did not open in the browser: {e}");
    }
}

/// The single-instance lock is named by the identifier, which the installed, portable and dev builds share;
/// only the release build on the default port takes it, so a dev copy beside an installed one still starts.
fn single_instance_wanted() -> bool {
    !cfg!(debug_assertions) && !service::port_is_explicit()
}

fn start_or_reuse_service(repo_root: &std::path::Path) -> Result<u16, String> {
    let port = service::listen_port_for(Some(repo_root))?;
    match service::claim_port(port, Duration::from_secs(20)).map_err(|busy| busy.to_string())? {
        Claim::Bound(listener) => {
            let root = repo_root.to_path_buf();
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::Builder::new()
                .name("vs-server".into())
                .spawn(move || {
                    let result = vs_server::serve_blocking(&root, listener).map_err(|e| format!("{e:#}"));
                    if let Err(e) = &result {
                        eprintln!("[ERROR] the embedded vs-server stopped: {e}");
                    }
                    let _ = tx.send(result);
                })
                .map_err(|e| e.to_string())?;
            wait_for_own_service(port, &rx)?;
        }
        Claim::AlreadyRunning(running) => {
            eprintln!("AI-Cut {} ({}) already serves 127.0.0.1:{port}: the window opens on it", running.version, running.service_executable);
        }
    }
    Ok(port)
}

/// Hides this process's own console window; a console shared with a terminal it was started from is left.
#[cfg(windows)]
fn hide_console_window() {
    extern "system" {
        fn GetConsoleWindow() -> isize;
        fn ShowWindow(hwnd: isize, n_cmd_show: i32) -> i32;
        fn GetConsoleProcessList(lpdw_process_list: *mut u32, dw_process_count: u32) -> u32;
    }
    unsafe {
        let mut pids = [0u32; 4];
        if GetConsoleProcessList(pids.as_mut_ptr(), pids.len() as u32) != 1 {
            return;
        }
        let hwnd = GetConsoleWindow();
        if hwnd != 0 {
            ShowWindow(hwnd, 0);
        }
    }
}

/// The service's answer to a plain local request: `Err(false)` when nothing listens, `Err(true)` when it did not
/// answer in `wait`.
fn service_call(path: &str, wait: Duration) -> Result<String, bool> {
    use std::io::{Read, Write};
    let Some(port) = service::recorded_port() else { return Err(false) };
    let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = std::net::TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return Err(false);
    };
    let _ = stream.set_read_timeout(Some(wait));
    let request = format!("GET {path} HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\n\r\n");
    let mut response = String::new();
    if stream.write_all(request.as_bytes()).is_err() || stream.read_to_string(&mut response).is_err() {
        return Err(true);
    }
    response.split("\r\n\r\n").nth(1).map(str::to_owned).ok_or(true)
}

/// Generations not finished yet; `None` when the service could not say in `wait`.
fn generations_in_progress(wait: Duration) -> Option<usize> {
    match service_call("/api/jobs/active", wait) {
        Ok(body) => serde_json::from_str::<serde_json::Value>(&body).ok().and_then(|answer| {
            answer["count"].as_u64().and_then(|count| usize::try_from(count).ok())
        }),
        Err(false) => Some(0),
        Err(true) => None,
    }
}

/// Quit, asking first only while a generation is not finished: one being sent, or answered in one request, is
/// lost with the program and may still be paid.
fn request_quit(app: &tauri::AppHandle) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static ASKING: AtomicBool = AtomicBool::new(false);
    if ASKING.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        confirm_quit(&app);
        ASKING.store(false, Ordering::Release);
    });
}

fn confirm_quit(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let running = generations_in_progress(Duration::from_secs(2));
    if running == Some(0) {
        app.exit(0);
        return;
    }
    let text = |key: &str, args: &[(&'static str, String)]| vs_server::i18n::text(key, args);
    let count = running.map_or_else(|| "?".to_string(), |count| count.to_string());
    let mut dialog = app
        .dialog()
        .message(text("quit-running", &[("count", count)]))
        .title(text("quit-title", &[]))
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(text("quit-button-quit", &[]), text("quit-button-stay", &[])));
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.parent(&window);
    }
    if dialog.blocking_show() {
        app.exit(0);
    }
}


pub fn run() {
    if !vs_server::process_group::bind_children_to_this_process() {
        eprintln!("[ERROR] the process did not join its own job object: ffmpeg children end only with their handles");
    }
    #[cfg(windows)]
    hide_console_window();
    let placed = match layout::resolve().and_then(|l| layout::apply_environment(&l).map(|_| l)) {
        Ok(l) => l,
        Err(e) => layout::fatal(&e),
    };
    let repo_root = placed.server_root;

    let context = tauri::generate_context!();
    service::set_app_version(context.package_info().version.to_string());

    let mut builder = tauri::Builder::default();
    if single_instance_wanted() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let shown = win.unminimize().and_then(|_| win.show()).and_then(|_| win.set_focus());
                if let Err(e) = shown {
                    eprintln!("[ERROR] second start: the AI-Cut window did not come to the front: {e}");
                }
            }
        }));
    }
    builder
        // a plugin's link script answers a click through IPC, which a page on http://127.0.0.1 is not given;
        // left to the webview, a click reaches on_new_window
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let port = match start_or_reuse_service(&repo_root) {
                Ok(p) => p,
                Err(message) => {
                    fatal(&message);
                    app.handle().exit(1);
                    return Ok(());
                }
            };
            let url = format!("http://127.0.0.1:{port}/projects");
            let icon = app.default_window_icon().cloned();
            let (for_tabs, for_links) = (app.handle().clone(), app.handle().clone());
            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse().expect("a valid URL")))
                .title(format!("AI-Cut {}{}", app.package_info().version, if layout::is_portable() { " Portable" } else { "" }))
                .inner_size(1600.0, 1000.0)
                .min_inner_size(1200.0, 760.0)
                .resizable(true)
                .maximized(true)
                // the webview handles dropped files itself, so the editor's drop zones receive them
                .disable_drag_drop_handler()
                // WebView2 silently drops target=_blank and window.open without a new-window handler
                .on_new_window(move |target, _features| {
                    open_in_browser(&for_tabs, &target);
                    tauri::webview::NewWindowResponse::Deny
                })
                .on_navigation(move |target| {
                    let own = target.host_str() == Some("127.0.0.1") && target.port() == Some(port);
                    if own || !matches!(target.scheme(), "http" | "https") {
                        return true;
                    }
                    open_in_browser(&for_links, target);
                    false
                })
                .build()?;
            if let Some(icon) = icon {
                let _ = win.set_icon(icon);
            }
            Ok(())
        })
        .build(context)
        .expect("Tauri did not start")
        .run(|app, event| match &event {
            // closing the main window quits on every platform; Cmd+Q and the Dock reach it as an exit request
            // with no code, and an exit the program requests itself carries one and goes through
            tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::CloseRequested { api, .. }, .. } if label == "main" => {
                api.prevent_close();
                request_quit(app);
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::ExitRequested { code: None, api, .. } => {
                api.prevent_exit();
                request_quit(app);
            }
            tauri::RunEvent::Exit => vs_server::hub::flush_on_exit(),
            _ => {}
        });
}
