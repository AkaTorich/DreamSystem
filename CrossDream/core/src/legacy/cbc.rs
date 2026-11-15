//! Старый шифр DreamMap: AES-256-CBC с PKCS7, формат файла [IV 16][шифртекст].
//! Только расшифровка — для разового переноса старых PDF.

use crate::error::{Error, Result};
use aes::cipher::generic_array::GenericArray;
use aes::cipher::{BlockDecrypt, BlockEncrypt, KeyInit};
use aes::Aes256;

pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
    if data.len() < 32 || (data.len() - 16) % 16 != 0 {
        return Err(Error::Crypto("старый файл повреждён".into()));
    }
    let cipher = Aes256::new(GenericArray::from_slice(key));
    let mut prev: [u8; 16] = data[..16].try_into().unwrap();
    let mut out = Vec::with_capacity(data.len() - 16);
    for chunk in data[16..].chunks(16) {
        let mut block = GenericArray::clone_from_slice(chunk);
        cipher.decrypt_block(&mut block);
        for (b, p) in block.iter_mut().zip(prev.iter()) {
            *b ^= p;
        }
        out.extend_from_slice(&block);
        prev.copy_from_slice(chunk);
    }
    let pad = *out.last().unwrap_or(&0) as usize;
    if pad == 0 || pad > 16 || pad > out.len() || !out[out.len() - pad..].iter().all(|&b| b as usize == pad) {
        return Err(Error::Crypto("старый ключ не подходит".into()));
    }
    out.truncate(out.len() - pad);
    Ok(out)
}

/// Зашифровать так же, как старая программа (нужно тестам и для проверки совместимости).
pub fn encrypt(key: &[u8; 32], iv: &[u8; 16], plain: &[u8]) -> Vec<u8> {
    let cipher = Aes256::new(GenericArray::from_slice(key));
    let pad = 16 - plain.len() % 16;
    let mut buf = plain.to_vec();
    buf.extend(std::iter::repeat(pad as u8).take(pad));
    let mut out = iv.to_vec();
    let mut prev = *iv;
    for chunk in buf.chunks(16) {
        let mut block = GenericArray::clone_from_slice(chunk);
        for (b, p) in block.iter_mut().zip(prev.iter()) {
            *b ^= p;
        }
        cipher.encrypt_block(&mut block);
        prev.copy_from_slice(&block);
        out.extend_from_slice(&block);
    }
    out
}
