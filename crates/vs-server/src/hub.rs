//! AI-Cut keeps no statistics: nothing is counted, stored or sent, and there is no hub client in the build.
//!
//! The module keeps the names the server used to call, so the rest of the code stays as it was: every
//! function is a no-op and the router is empty.

use std::path::Path;

use crate::jobs::Job;

pub fn start(_data: &Path, _http: reqwest::Client) {}

pub fn set_language(_language: &str) {}

pub fn flush_on_exit() {}

pub fn router<S: Clone + Send + Sync + 'static>() -> axum::Router<S> {
    axum::Router::<S>::new()
}

pub fn job_ended(_job: &Job) {}

pub fn count(_name: &str) {}