//! Шифр туда-обратно: новое хранилище (AES-256-GCM), старый конверт DreamMap (AES-256-CBC), DPAPI.

use dream_core::legacy::cbc;
use dream_core::Vault;
use std::path::PathBuf;

fn tmp(name: &str) -> PathBuf {
    let p = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name).join(dream_core::util::rand_name(""));
    std::fs::create_dir_all(&p).unwrap();
    p
}

#[test]
fn gcm_round_trip() {
    let v = Vault::from_key([7u8; 32]);
    for plain in [b"".to_vec(), b"%PDF-1.7 short".to_vec(), vec![0xAB; 100_000]] {
        let enc = v.encrypt(&plain).unwrap();
        assert_ne!(enc[16..], plain[..]);
        assert_eq!(v.decrypt(&enc).unwrap(), plain);
    }
    // одно и то же шифруется по-разному (случайный nonce)
    assert_ne!(v.encrypt(b"abc").unwrap(), v.encrypt(b"abc").unwrap());
}

#[test]
fn gcm_rejects_wrong_key_and_damage() {
    let v = Vault::from_key([1u8; 32]);
    let mut enc = v.encrypt(b"secret dream").unwrap();
    assert!(Vault::from_key([2u8; 32]).decrypt(&enc).is_err());
    let last = enc.len() - 1;
    enc[last] ^= 1;
    assert!(v.decrypt(&enc).is_err());
    assert!(v.decrypt(b"not a vault file at all, really").is_err());
}

#[test]
fn profile_key_persists() {
    let dir = tmp("vault");
    let a = Vault::open(&dir).unwrap();
    let enc = a.encrypt(b"hello").unwrap();
    let b = Vault::open(&dir).unwrap(); // ключ читается из vault.key (на Windows — через DPAPI)
    assert_eq!(b.decrypt(&enc).unwrap(), b"hello");
    let raw = std::fs::read(dir.join("vault.key")).unwrap();
    if cfg!(windows) {
        assert_eq!(raw[0], b'D', "на Windows ключ запечатан DPAPI");
    }
}

#[test]
fn legacy_cbc_round_trip() {
    let key = [9u8; 32];
    let iv = [3u8; 16];
    for plain in [b"".to_vec(), b"0123456789abcdef".to_vec(), b"%PDF-1.4 old file".to_vec()] {
        let enc = cbc::encrypt(&key, &iv, &plain);
        assert_eq!(enc.len() % 16, 0);
        assert_eq!(cbc::decrypt(&key, &enc).unwrap(), plain);
    }
    let enc = cbc::encrypt(&key, &iv, b"some text here!");
    assert!(cbc::decrypt(&[8u8; 32], &enc).is_err() || cbc::decrypt(&[8u8; 32], &enc).unwrap() != b"some text here!");
}

/// Известный вектор .NET: Aes CBC/PKCS7, ключ 0..31, IV 0..15, текст "DreamMap".
#[test]
fn legacy_cbc_matches_dotnet_layout() {
    let key: [u8; 32] = core::array::from_fn(|i| i as u8);
    let iv: [u8; 16] = core::array::from_fn(|i| i as u8);
    let enc = cbc::encrypt(&key, &iv, b"DreamMap");
    assert_eq!(&enc[..16], &iv, "первые 16 байт — IV, как в старом .enc");
    assert_eq!(enc.len(), 32);
    assert_eq!(cbc::decrypt(&key, &enc).unwrap(), b"DreamMap");
}

#[cfg(windows)]
#[test]
fn dpapi_round_trip() {
    use dream_core::vault::dpapi;
    let sealed = dpapi::protect(b"key-bytes", "DreamMap·врата·снов·2026".as_bytes()).unwrap();
    assert_eq!(dpapi::unprotect(&sealed, "DreamMap·врата·снов·2026".as_bytes()).unwrap(), b"key-bytes");
    assert!(dpapi::unprotect(&sealed, b"other entropy").is_err());
}
