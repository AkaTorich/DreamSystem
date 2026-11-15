//! DPAPI Windows: запечатать байты на текущего пользователя (и распечатать обратно).

use crate::error::{Error, Result};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
}

/// Забрать выход DPAPI в Vec и освободить память Windows.
unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
    let _ = LocalFree(Some(HLOCAL(out.pbData as *mut core::ffi::c_void)));
    v
}

pub fn protect(plain: &[u8], entropy: &[u8]) -> Result<Vec<u8>> {
    let input = blob(plain);
    let ent = blob(entropy);
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &input,
            PCWSTR::null(),
            Some(&ent),
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out,
        )
        .map_err(|e| Error::Crypto(format!("DPAPI: {e}")))?;
        Ok(take(out))
    }
}

pub fn unprotect(sealed: &[u8], entropy: &[u8]) -> Result<Vec<u8>> {
    let input = blob(sealed);
    let ent = blob(entropy);
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &input,
            None,
            Some(&ent),
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out,
        )
        .map_err(|e| Error::Crypto(format!("DPAPI: {e}")))?;
        Ok(take(out))
    }
}
