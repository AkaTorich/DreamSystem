//! Ошибки ядра. В интерфейс уходят строкой (сериализация — просто текст ошибки).

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("файл: {0}")]
    Io(#[from] std::io::Error),
    #[error("данные: {0}")]
    Json(#[from] serde_json::Error),
    #[error("связь с сайтом: {0}")]
    Http(String),
    /// ответ сайта `{error: "…"}` — текст как есть, без приставок
    #[error("{0}")]
    Site(String),
    #[error("шифр: {0}")]
    Crypto(String),
    #[error("{0}")]
    Msg(String),
}

impl Error {
    pub fn msg(s: impl Into<String>) -> Self {
        Error::Msg(s.into())
    }
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Error::Http(e.to_string())
    }
}

impl From<base64::DecodeError> for Error {
    fn from(e: base64::DecodeError) -> Self {
        Error::Msg(format!("base64: {e}"))
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
