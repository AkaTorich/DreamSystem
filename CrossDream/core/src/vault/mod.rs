//! Хранилище под замком: AES-256-GCM, у каждого профиля свой ключ (32 случайных байта).
//! Ключ лежит в профиле (`vault.key`); на Windows он дополнительно запечатан DPAPI
//! на текущего пользователя — украденный файл на другой машине не откроется.
//! Формат зашифрованного: "CDV1" + nonce 12 байт + шифртекст с тегом.

#[cfg(windows)]
pub mod dpapi;

use crate::error::{Error, Result};
use crate::store::files::write_atomic;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use std::path::Path;

const MAGIC: &[u8; 4] = b"CDV1";
const KEY_FILE: &str = "vault.key";
/// довесок DPAPI: чужая программа того же пользователя key не распечатает без него
#[cfg(windows)]
const ENTROPY: &str = "CrossDream·врата·снов·2026";

#[derive(Clone)]
pub struct Vault {
    key: [u8; 32],
}

impl Vault {
    pub fn from_key(key: [u8; 32]) -> Self {
        Vault { key }
    }

    /// Ключ профиля из `dir/vault.key`; нет файла — создаётся новый.
    pub fn open(dir: &Path) -> Result<Self> {
        let path = dir.join(KEY_FILE);
        if path.exists() {
            let raw = std::fs::read(&path)?;
            return Ok(Vault { key: unseal(&raw)? });
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&crate::util::random_bytes(32));
        std::fs::create_dir_all(dir)?;
        write_atomic(&path, &seal(&key)?)?;
        Ok(Vault { key })
    }

    pub fn encrypt(&self, plain: &[u8]) -> Result<Vec<u8>> {
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|e| Error::Crypto(e.to_string()))?;
        let nonce_bytes = crate::util::random_bytes(12);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let body = cipher
            .encrypt(nonce, plain)
            .map_err(|_| Error::Crypto("не удалось зашифровать".into()))?;
        let mut out = Vec::with_capacity(4 + 12 + body.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&body);
        Ok(out)
    }

    pub fn decrypt(&self, data: &[u8]) -> Result<Vec<u8>> {
        if data.len() < 4 + 12 + 16 || &data[..4] != MAGIC {
            return Err(Error::Crypto("файл не из этого хранилища".into()));
        }
        let cipher = Aes256Gcm::new_from_slice(&self.key).map_err(|e| Error::Crypto(e.to_string()))?;
        cipher
            .decrypt(Nonce::from_slice(&data[4..16]), &data[16..])
            .map_err(|_| Error::Crypto("ключ не подходит или файл повреждён".into()))
    }

    pub fn encrypt_to_file(&self, plain: &[u8], path: &Path) -> Result<()> {
        write_atomic(path, &self.encrypt(plain)?)
    }

    pub fn decrypt_file(&self, path: &Path) -> Result<Vec<u8>> {
        self.decrypt(&std::fs::read(path)?)
    }
}

/// Ключ → содержимое файла: "D"+DPAPI на Windows, "R"+ключ на прочих системах.
fn seal(key: &[u8; 32]) -> Result<Vec<u8>> {
    #[cfg(windows)]
    {
        let mut v = vec![b'D'];
        v.extend(dpapi::protect(key, ENTROPY.as_bytes())?);
        Ok(v)
    }
    #[cfg(not(windows))]
    {
        let mut v = vec![b'R'];
        v.extend_from_slice(key);
        Ok(v)
    }
}

fn unseal(raw: &[u8]) -> Result<[u8; 32]> {
    let plain: Vec<u8> = match raw.first() {
        Some(b'R') => raw[1..].to_vec(),
        #[cfg(windows)]
        Some(b'D') => dpapi::unprotect(&raw[1..], ENTROPY.as_bytes())?,
        _ => return Err(Error::Crypto("ключ профиля не читается".into())),
    };
    if plain.len() != 32 {
        return Err(Error::Crypto("ключ профиля повреждён".into()));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&plain);
    Ok(key)
}
