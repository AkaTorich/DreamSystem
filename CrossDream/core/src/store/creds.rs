//! Пароль сайта для тихого входа: лежит в профиле зашифрованным ключом профиля (`auth.dat`).

use super::Store;
use crate::error::Result;

const AUTH: &str = "auth.dat";

impl Store {
    pub fn save_pass(&self, pass: &str) -> Result<()> {
        let v = self.vault()?;
        v.encrypt_to_file(pass.as_bytes(), &self.file(AUTH))
    }

    /// Сохранённый пароль; нет или не читается — None.
    pub fn load_pass(&self) -> Option<String> {
        let path = self.file(AUTH);
        if !path.exists() {
            return None;
        }
        let bytes = self.vault().ok()?.decrypt_file(&path).ok()?;
        String::from_utf8(bytes).ok().filter(|s| !s.is_empty())
    }

    pub fn forget_pass(&self) -> Result<()> {
        let path = self.file(AUTH);
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        Ok(())
    }
}
