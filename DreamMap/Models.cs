using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace DreamMap
{
    public class Analysis
    {
        public string Summary = "";
        public string Location = "";
        public List<string> Characters = new List<string>();
        public List<string> Emotions = new List<string>();
        public List<string> Symbols = new List<string>();
        public List<string> Motifs = new List<string>();
    }

    public class Link
    {
        public string Id = "";
        public string Type = "";
        public string Reason = "";
    }

    public class Dream
    {
        public string Id = "";
        public string Title = "";
        public string Date = "";
        public string Text = "";
        public Analysis Analysis = null;
        public string ImagePrompt = "";
        public string ImageFile = "";
        public List<Link> Links = new List<Link>();
        public double? PosX = null;   // авторские координаты на сфере (смещение от центра)
        public double? PosY = null;
        public double? PosZ = null;
        public string PosTime = null; // серверное время правки: новее — главнее
    }

    public class PlanetPos
    {
        public double X, Y, Z;
        public string Time = "";
    }

    public class Settings
    {
        // ключа ИИ здесь НЕТ: он хранится только на сайте и никогда не покидает сервер
        public string TextModel = "google/gemini-2.5-flash";
        public string ImageModel = "google/gemini-2.5-flash-image";
        public bool GenImages = true;
        public string ServerUrl = "https://globthe.top"; // боевой сервер; локальный XAMPP — http://localhost/dreamweb
        public string SiteLogin = "";
        public string SitePass = "";
        public double PdfZoom = 1.0;
        public string ProfileOwner = ""; // чьи данные лежали в корне до разделения по аккаунтам
        public double MapZoom = 0;   // 0 = не задан; синхронизируется с аккаунтом сайта
        public double MapYaw = 0;    // (устарело: сфера больше не вращается)
        public double MapPitch = 0;
        public double MapPanX = 0;   // сдвиг карты по X/Y — часть личного вида
        public double MapPanY = 0;
        public bool MapLinks = true; // нити между узлами видны; глаз в легенде их прячет
        public string ViewTime = ""; // серверное время правки вида: новее — главнее
        // последняя открытая страница каждого PDF (id → номер с 1); та же память живёт и на сайте
        public Dictionary<string, int> PdfPage = new Dictionary<string, int>();
    }

    public class PdfBook
    {
        public string Id = "";
        public string Title = "";
        public string File = "";
        public int LastPage = 0;   // последняя открытая страница (с 1); дублируется в настройках и на сайте
    }

    public static class Store
    {
        // корень данных; содержимое (сны, планеты, картинки, pdf) живёт в профиле аккаунта,
        // чтобы сны разных участников НИКОГДА не смешивались на одной машине
        public static readonly string BaseDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "DreamMap");
        static string _profile = "";

        public static string Dir
        { get { return _profile.Length == 0 ? BaseDir : Path.Combine(BaseDir, "profiles", _profile); } }
        public static string ImagesDir { get { return Path.Combine(Dir, "images"); } }
        public static string PdfDir { get { return Path.Combine(Dir, "pdf"); } }
        static string PdfsFile { get { return Path.Combine(Dir, "pdfs.json"); } }

        static string SanitizeLogin(string s)
        {
            var sb = new System.Text.StringBuilder();
            foreach (char c in (s ?? "").Trim().ToLowerInvariant())
                sb.Append(char.IsLetterOrDigit(c) || c == '_' || c == '-' ? c : '_');
            return sb.ToString();
        }

        /* Привязка данных к аккаунту. Данные из корня (до разделения) переезжают
           в профиль их владельца — и только его (ProfileOwner). */
        public static void SetAccount(string login, Settings s)
        {
            string p = SanitizeLogin(login);
            if (p != _profile) Vault.Forget();   // чужой профиль — чужой ключ
            _profile = p;
            if (p.Length > 0 && !File.Exists(Path.Combine(BaseDir, "profiles", p, "dreams.json")))
            {
                string owner = SanitizeLogin(s != null ? s.ProfileOwner : "");
                bool rootHasData = File.Exists(Path.Combine(BaseDir, "dreams.json"));
                if (rootHasData && (owner.Length == 0 || owner == p))
                {
                    try
                    {
                        string dst = Path.Combine(BaseDir, "profiles", p);
                        Directory.CreateDirectory(dst);
                        foreach (var f in new[] { "dreams.json", "planets.json", "pdfs.json" })
                            if (File.Exists(Path.Combine(BaseDir, f)))
                                File.Move(Path.Combine(BaseDir, f), Path.Combine(dst, f));
                        foreach (var d in new[] { "images", "pdf" })
                            if (Directory.Exists(Path.Combine(BaseDir, d)))
                                Directory.Move(Path.Combine(BaseDir, d), Path.Combine(dst, d));
                    }
                    catch { }
                    if (s != null && string.IsNullOrEmpty(s.ProfileOwner)) s.ProfileOwner = login;
                }
            }
            EnsureDirs();
        }

        public static List<PdfBook> LoadPdfs()
        {
            try
            {
                if (File.Exists(PdfsFile))
                    return JsonConvert.DeserializeObject<List<PdfBook>>(File.ReadAllText(PdfsFile))
                        ?? new List<PdfBook>();
            }
            catch { }
            return new List<PdfBook>();
        }

        public static void SavePdfs(List<PdfBook> pdfs)
        {
            Directory.CreateDirectory(PdfDir);
            File.WriteAllText(PdfsFile, JsonConvert.SerializeObject(pdfs, Formatting.Indented));
        }

        // полный путь к файлу PDF на полке (уже зашифрованному .enc)
        public static string PdfPath(PdfBook p) { return Path.Combine(PdfDir, p.File); }

        // положить PDF на полку под замок: открытые байты → <id>.enc
        public static string StashPdf(string id, byte[] bytes)
        {
            Directory.CreateDirectory(PdfDir);
            string file = id + ".enc";
            Vault.EncryptToFile(bytes, Path.Combine(PdfDir, file), Dir);
            return file;
        }

        // достать открытые байты PDF в память (на диск не пишем)
        public static byte[] ReadPdf(PdfBook p) { return Vault.DecryptFile(PdfPath(p), Dir); }

        // разовый переезд старых открытых .pdf под замок; правит список и стирает открытые копии
        public static bool EncryptLegacyPdfs(List<PdfBook> pdfs)
        {
            bool changed = false;
            foreach (var p in pdfs)
            {
                if (string.IsNullOrEmpty(p.File) || p.File.EndsWith(".enc")) continue;
                string plain = Path.Combine(PdfDir, p.File);
                if (!File.Exists(plain)) continue;
                try
                {
                    p.File = StashPdf(p.Id, File.ReadAllBytes(plain));
                    File.Delete(plain);
                    changed = true;
                }
                catch { }
            }
            if (changed) SavePdfs(pdfs);
            return changed;
        }
        static string DreamsFile { get { return Path.Combine(Dir, "dreams.json"); } }
        static string SettingsFile { get { return Path.Combine(BaseDir, "settings.json"); } } // настройки общие

        public static void EnsureDirs()
        {
            // данные старых версий лежали в %APPDATA%\КартаСнов — переносим при первом запуске
            string old = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "КартаСнов");
            if (Directory.Exists(old) && !Directory.Exists(BaseDir))
            {
                try { Directory.Move(old, BaseDir); } catch { }
            }
            Directory.CreateDirectory(Dir);
            Directory.CreateDirectory(ImagesDir);
            Directory.CreateDirectory(PdfDir);
        }

        public static Settings LoadSettings()
        {
            try
            {
                if (File.Exists(SettingsFile))
                    return JsonConvert.DeserializeObject<Settings>(File.ReadAllText(SettingsFile)) ?? new Settings();
            }
            catch { }
            return new Settings();
        }

        public static void SaveSettings(Settings s)
        {
            EnsureDirs();
            File.WriteAllText(SettingsFile, JsonConvert.SerializeObject(s, Formatting.Indented));
        }

        public static List<Dream> LoadDreams()
        {
            try
            {
                if (File.Exists(DreamsFile))
                    return JsonConvert.DeserializeObject<List<Dream>>(File.ReadAllText(DreamsFile)) ?? new List<Dream>();
            }
            catch { }
            return new List<Dream>();
        }

        public static void SaveDreams(List<Dream> dreams)
        {
            EnsureDirs();
            File.WriteAllText(DreamsFile, JsonConvert.SerializeObject(dreams, Formatting.Indented));
        }

        /* Надгробия: id снов, удалённых здесь. Пока удаление не доехало до сайта,
           синхронизация не должна тащить сон обратно — иначе он воскресает. */
        static string GravesFile { get { return Path.Combine(Dir, "deleted.json"); } }

        public static HashSet<string> LoadGraves()
        {
            try
            {
                if (File.Exists(GravesFile))
                    return new HashSet<string>(
                        JsonConvert.DeserializeObject<List<string>>(File.ReadAllText(GravesFile))
                        ?? new List<string>());
            }
            catch { }
            return new HashSet<string>();
        }

        public static void SaveGraves(HashSet<string> ids)
        {
            EnsureDirs();
            File.WriteAllText(GravesFile, JsonConvert.SerializeObject(new List<string>(ids), Formatting.Indented));
        }

        static string PlanetsFile { get { return Path.Combine(Dir, "planets.json"); } }

        public static Dictionary<string, PlanetPos> LoadPlanets()
        {
            try
            {
                if (File.Exists(PlanetsFile))
                    return JsonConvert.DeserializeObject<Dictionary<string, PlanetPos>>(
                        File.ReadAllText(PlanetsFile)) ?? new Dictionary<string, PlanetPos>();
            }
            catch { }
            return new Dictionary<string, PlanetPos>();
        }

        public static void SavePlanets(Dictionary<string, PlanetPos> p)
        {
            File.WriteAllText(PlanetsFile, JsonConvert.SerializeObject(p, Formatting.Indented));
        }

        // безымянное имя файла: только хеш и расширение (как на сервере)
        public static string RandName(string ext)
        {
            return Guid.NewGuid().ToString("N") + (string.IsNullOrEmpty(ext) ? "" : "." + ext);
        }

        public static string ImagePath(Dream d)
        {
            if (string.IsNullOrEmpty(d.ImageFile)) return null;
            string p = Path.Combine(ImagesDir, d.ImageFile);
            return File.Exists(p) ? p : null;
        }
    }
}
