using System;
using System.IO;
using System.Security.Cryptography;

namespace DreamMap
{
    // Хранилище под замком. PDF на диске лежат зашифрованными AES-256:
    //  · у каждого профиля свой мастер-ключ (32 случайных байта);
    //  · сам ключ хранится в key.dat, запечатанный DPAPI на текущего пользователя Windows —
    //    поэтому ни .enc-файл, ни украденный key.dat не открыть на другой машине/учётке.
    // Расшифровка идёт только в память; открытый PDF на диск не попадает никогда.
    public static class Vault
    {
        static byte[] _key;
        static string _keyDir = "";

        // энтропия DPAPI: свой довесок, чтобы key.dat нельзя было распечатать чужой программой
        static readonly byte[] Entropy = System.Text.Encoding.UTF8.GetBytes("DreamMap·врата·снов·2026");

        static byte[] MasterKey(string dir)
        {
            if (_key != null && _keyDir == dir) return _key;
            Directory.CreateDirectory(dir);
            string keyFile = Path.Combine(dir, "key.dat");
            byte[] key;
            if (File.Exists(keyFile))
            {
                byte[] sealed_ = File.ReadAllBytes(keyFile);
                key = ProtectedData.Unprotect(sealed_, Entropy, DataProtectionScope.CurrentUser);
            }
            else
            {
                key = new byte[32];
                using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(key);
                byte[] sealed_ = ProtectedData.Protect(key, Entropy, DataProtectionScope.CurrentUser);
                File.WriteAllBytes(keyFile, sealed_);
            }
            _key = key; _keyDir = dir;
            return key;
        }

        // забыть ключ при смене аккаунта, чтобы не расшифровать чужой профиль
        public static void Forget() { _key = null; _keyDir = ""; }

        // формат .enc: [IV 16][шифртекст]. keyDir — профиль, к которому привязан ключ.
        public static void EncryptToFile(byte[] plain, string path, string keyDir)
        {
            byte[] key = MasterKey(keyDir);
            using (var aes = Aes.Create())
            {
                aes.KeySize = 256; aes.Key = key; aes.GenerateIV();
                aes.Mode = CipherMode.CBC; aes.Padding = PaddingMode.PKCS7;
                using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write))
                {
                    fs.Write(aes.IV, 0, aes.IV.Length);
                    using (var enc = aes.CreateEncryptor())
                    using (var cs = new CryptoStream(fs, enc, CryptoStreamMode.Write))
                        cs.Write(plain, 0, plain.Length);
                }
            }
        }

        public static byte[] DecryptFile(string path, string keyDir)
        {
            byte[] key = MasterKey(keyDir);
            byte[] all = File.ReadAllBytes(path);
            byte[] iv = new byte[16];
            Array.Copy(all, 0, iv, 0, 16);
            using (var aes = Aes.Create())
            {
                aes.KeySize = 256; aes.Key = key; aes.IV = iv;
                aes.Mode = CipherMode.CBC; aes.Padding = PaddingMode.PKCS7;
                using (var ms = new MemoryStream())
                {
                    using (var dec = aes.CreateDecryptor())
                    using (var cs = new CryptoStream(
                        new MemoryStream(all, 16, all.Length - 16), dec, CryptoStreamMode.Read))
                        cs.CopyTo(ms);
                    return ms.ToArray();
                }
            }
        }
    }
}
