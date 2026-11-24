//! The editor window: the built frontend (`frontend/dist`) with index.html for every route the router owns
//! on the page (`/projects`, `/editor/<id>`), so a reload on a deep link opens the same screen.

use std::path::Path;

use axum::extract::Request;
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Router;
use tower_http::services::{ServeDir, ServeFile};

pub fn router(repo_root: &Path) -> Router {
    let dist = repo_root.join("frontend").join("dist");
    if !dist.join("index.html").is_file() {
        let missing = format!("The window is not built: {} has no index.html. Run npm run build in frontend/.", dist.display());
        return Router::new().fallback(move || {
            let missing = missing.clone();
            async move { (StatusCode::NOT_FOUND, missing).into_response() }
        });
    }
    let index = ServeFile::new(dist.join("index.html"));
    Router::new()
        .fallback_service(ServeDir::new(&dist).append_index_html_on_directories(true).fallback(index))
        .layer(axum::middleware::from_fn(no_store_for_documents))
}

/// Keeps the window's HTML out of the WebView cache. A rebuilt editor keeps the same address, so a
/// cached `index.html` would keep loading the previous bundle — old screens and old shortcuts —
/// until the cache decides to revalidate. Hashed assets (`assets/app-<hash>.js`) stay cacheable;
/// only the documents (paths without a file extension) are marked `no-store`.
async fn no_store_for_documents(request: Request, next: Next) -> Response {
    let is_document = {
        let path = request.uri().path();
        !path.rsplit('/').next().unwrap_or_default().contains('.')
    };
    let mut response = next.run(request).await;
    if is_document {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store, must-revalidate"));
    }
    response
}
