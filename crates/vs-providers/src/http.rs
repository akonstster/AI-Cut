//! One HTTP client for every provider: a named User-Agent (Runware's documentation answers 403 without
//! one), a connect timeout, and JSON helpers that keep the status of a refused request.

use std::time::Duration;

use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::model::ProviderError;

pub const USER_AGENT: &str = concat!("AI-Cut/", env!("CARGO_PKG_VERSION"), " (+https://github.com/timoncool/AI-Cut)");

#[derive(Clone)]
pub struct Http {
    pub client: reqwest::Client,
}

pub type Auth = Option<(&'static str, String)>;

impl Http {
    pub fn new(builder: reqwest::ClientBuilder) -> Result<Self, ProviderError> {
        let client = builder
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|error| ProviderError::Network(error.to_string()))?;
        Ok(Self { client })
    }

    fn with_auth(request: reqwest::RequestBuilder, auth: Auth) -> reqwest::RequestBuilder {
        match auth {
            Some((name, value)) => request.header(name, value),
            None => request,
        }
    }

    /// A small JSON answer: a catalogue page, a job's status. It has its own short deadline, so a stalled
    /// connection is retried instead of holding the caller for the long download timeout.
    pub async fn get_json<T: DeserializeOwned>(&self, url: &str, auth: Auth) -> Result<T, ProviderError> {
        let response = Self::with_auth(self.client.get(url), auth).timeout(Duration::from_secs(90)).send().await?;
        let status = response.status();
        let text = response.text().await?;
        if !status.is_success() {
            return Err(refusal(status, &text));
        }
        serde_json::from_str(&text).map_err(|error| ProviderError::Network(format!("{url}: not the expected JSON ({error})")))
    }

    /// POSTs JSON; the status and the body come back whatever the status, the caller reads both. A 429 means the
    /// provider took nothing, so it is sent again after 1, 2 and 4 seconds (or the Retry-After given); a 5xx is not,
    /// since the job may have been taken and paid for.
    pub async fn post_json(&self, url: &str, auth: Auth, body: &Value) -> Result<(StatusCode, Value), ProviderError> {
        let mut pause = Duration::from_secs(1);
        let mut attempt = 0;
        loop {
            let response = Self::with_auth(self.client.post(url), auth.clone()).json(body).send().await?;
            let status = response.status();
            let asked = retry_after(response.headers());
            let text = response.text().await?;
            if status == StatusCode::TOO_MANY_REQUESTS && attempt < 3 {
                tokio::time::sleep(asked.unwrap_or(pause).min(Duration::from_secs(30))).await;
                pause *= 2;
                attempt += 1;
                continue;
            }
            let value = serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text.chars().take(2000).collect()));
            return Ok((status, value));
        }
    }

    pub async fn get_bytes(&self, url: &str, auth: Auth) -> Result<(Vec<u8>, Option<String>), ProviderError> {
        for attempt in 0..3 {
            match self.get_bytes_once(url, auth.clone()).await {
                Err(ProviderError::Busy(_)) | Err(ProviderError::Network(_)) if attempt < 2 => {
                    tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
                }
                result => return result,
            }
        }
        unreachable!()
    }

    async fn get_bytes_once(&self, url: &str, auth: Auth) -> Result<(Vec<u8>, Option<String>), ProviderError> {
        let response = Self::with_auth(self.client.get(url), auth).send().await?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(refusal(status, &text));
        }
        let mime = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok()).map(|value| value.split(';').next().unwrap_or(value).trim().to_string());
        Ok((response.bytes().await?.to_vec(), mime))
    }
}

/// The `Retry-After` a provider asks for, in seconds; HTTP dates are ignored, the doubling pause covers them.
fn retry_after(headers: &reqwest::header::HeaderMap) -> Option<Duration> {
    headers.get(reqwest::header::RETRY_AFTER)?.to_str().ok()?.trim().parse::<u64>().ok().map(Duration::from_secs)
}

/// A refused request as an error: 429 and 5xx are worth sending again, the rest are not.
pub fn refusal(status: StatusCode, body: &str) -> ProviderError {
    let message = provider_message(body).unwrap_or_else(|| body.chars().take(300).collect());
    let text = format!("{status}: {message}");
    if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
        ProviderError::Busy(text)
    } else {
        ProviderError::Refused(text)
    }
}

/// The human part of a provider's error body: `{"error":{"message"}}`, `{"detail"}`, `{"errors":[{"message"}]}`.
pub fn provider_message(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    if let Some(message) = value.pointer("/error/message").and_then(Value::as_str) {
        return Some(message.to_string());
    }
    if let Some(message) = value.get("error").and_then(Value::as_str) {
        return Some(message.to_string());
    }
    if let Some(detail) = value.get("detail") {
        return Some(match detail {
            Value::String(text) => text.clone(),
            Value::Array(items) => items.iter().filter_map(|item| item.get("msg").and_then(Value::as_str)).collect::<Vec<_>>().join("; "),
            other => other.to_string(),
        });
    }
    value.pointer("/errors/0/message").and_then(Value::as_str).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_after_reads_whole_seconds_and_ignores_dates() {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(reqwest::header::RETRY_AFTER, reqwest::header::HeaderValue::from_static("7"));
        assert_eq!(retry_after(&headers), Some(Duration::from_secs(7)));

        headers.insert(reqwest::header::RETRY_AFTER, reqwest::header::HeaderValue::from_static("Wed, 21 Oct 2026 07:28:00 GMT"));
        assert_eq!(retry_after(&headers), None);

        assert_eq!(retry_after(&reqwest::header::HeaderMap::new()), None);
    }
}
