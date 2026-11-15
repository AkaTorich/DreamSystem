using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.Runtime.InteropServices;

namespace DreamMap
{
    public partial class MainWindow
    {
        /* ================= сайт: аккаунт и синхронизация ================= */
        SiteClient _site;
        string _siteRole;
        int _siteUid;
        readonly Dictionary<string, int> _posMap = new Dictionary<string, int>(); // локальный id -> id сна на сайте
        HashSet<string> _graves = Store.LoadGraves();   // сны, удалённые здесь: на сайт ещё не доехало

        async System.Threading.Tasks.Task TryAutoLogin()
        {
            SyncBegin("Вход на сайт");
            try
            {
                SyncPart(0, 0.05);
                SyncStep("вход на сайт…", 0.3);
                _site = new SiteClient(_settings.ServerUrl);
                var j = await _site.PostJson("login", new
                { login = _settings.SiteLogin, pass = _settings.SitePass, invite = "" });
                _siteRole = (string)j["user"]["role"];
                _siteUid = (int)j["user"]["id"];
                CosmosBtn.Visibility = RankOf(_siteRole) >= 2 ? Visibility.Visible : Visibility.Collapsed;
                ShowWho();
                ApplySiteColors(j["user"]);
                await SyncViewQuiet(j["user"]);
                // при запуске тихо подтягиваем всё своё: сны и нити, книги, PDF, положение карты
                EnsurePdfs();   // список PDF уже на диске — загрузим до замера, иначе «было» = 0
                int wasD = _dreams.Count;
                int wasP = _pdfs.Count;
                SyncPart(0.05, 0.55);
                bool dreamsOk = await SyncDreamsAsync(quiet: true);
                SyncPart(0.55, 0.95);
                await SyncBooksAsync(quiet: true);
                SyncPart(0.95, 1);
                SyncStep("места на карте, раскладка библиотеки, ларец даров", 0.2);
                if (!dreamsOk) await SyncPositionsQuiet();   // иначе позиции уже сверены
                await LoadFoldersQuiet();   // библиотека откроется сразу с папками, без мигания
                await CheckGiftsQuiet();
                RebuildGraph(); RenderList();
                int gotD = _dreams.Count - wasD;
                int gotP = (_pdfs == null ? 0 : _pdfs.Count) - wasP;
                if (gotD > 0 || gotP > 0)
                    Toast("С сайта пришло: снов — " + gotD + (gotP > 0 ? ", PDF — " + gotP : ""));
            }
            catch (Exception ex) { _siteRole = null; SyncFail("вход на сайт не удался: " + ex.Message); }
            finally { SyncEnd(); }
        }

        async System.Threading.Tasks.Task CheckGiftsQuiet()
        {
            try
            {
                var g = await _site.Get("gifts_list");
                int n = (int)g["count"];
                UpdateGiftBadge(n);
                if (n > 0) Toast("🎁 В вашем ларце " + n + " дар(а) — откройте «🎁» в шапке");
            }
            catch { }
        }

        // выход: логин и пароль забываются, программа остаётся при своих снах
        void SiteLogout_Click(object sender, RoutedEventArgs e)
        {
            if (MessageBox.Show(
                "Забыть логин и пароль на этом компьютере?\n\n" +
                "Сны, книги и картинки останутся на месте. Толкование через ИИ,\n" +
                "космос и дары станут недоступны до следующего входа.",
                "Выход из аккаунта", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            _site = null; _siteRole = null; _siteUid = -1;
            _viewDreams = null; _viewDreamer = null; _viewUid = -1; _cosmosMode = false;
            _settings.SitePass = ""; _settings.SiteLogin = "";
            Store.SaveSettings(_settings);
            StatusText.Text = "сайт не подключён";
            SSitePass.Password = ""; SSiteLogin.Text = "";
            SitePanel.Visibility = Visibility.Collapsed;
            SiteAdmin.Visibility = Visibility.Collapsed;
            WhoChip.Visibility = Visibility.Collapsed;
            CosmosBtn.Visibility = Visibility.Collapsed;
            UsersBtn.Visibility = Visibility.Collapsed;
            GiftsBtn.Visibility = Visibility.Collapsed;
            TrustBtn.Visibility = Visibility.Collapsed;
            DreamersPanel.Visibility = Visibility.Collapsed;
            SiteStatus.Text = "Вы вышли. Программа работает локально, без ИИ.";
            RebuildGraph(); RenderList();
        }

        void OpenLarets_Click(object sender, RoutedEventArgs e)
        {
            SiteOverlay.Visibility = Visibility.Collapsed;
            Gifts_Click(null, null);   // ларец теперь свой, а не на сайте
        }

        static DateTime? ParseT(string s)
        {
            DateTime d;
            return DateTime.TryParse(s, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeUniversal |
                System.Globalization.DateTimeStyles.AdjustToUniversal, out d)
                ? d : (DateTime?)null;
        }

        // вид карты: новее — главнее (сравнение серверных штампов)
        async System.Threading.Tasks.Task SyncViewQuiet(Newtonsoft.Json.Linq.JToken user)
        {
            try
            {
                DateTime? siteT = ParseT((string)user["view_time"]);
                DateTime? localT = ParseT(_settings.ViewTime);
                string mv = (string)user["map_view"];
                bool siteHas = !string.IsNullOrEmpty(mv);
                bool localHas = _settings.MapZoom > 0
                    || Math.Abs(_settings.MapPanX) > 0.001 || Math.Abs(_settings.MapPanY) > 0.001;
                bool siteNewer = siteHas &&
                    (!localHas || (siteT.HasValue && (!localT.HasValue || siteT > localT.Value.AddSeconds(1))));
                bool localNewer = localHas &&
                    (!siteHas || (localT.HasValue && (!siteT.HasValue || localT > siteT.Value.AddSeconds(1))));
                if (siteNewer)
                {
                    var v = Newtonsoft.Json.Linq.JObject.Parse(mv);
                    _yaw = 0; _pitch = 0;
                    SetZoomCentered((double?)v["zoom"] ?? 1);
                    _panT.X = (double?)v["panx"] ?? 0;
                    _panT.Y = (double?)v["pany"] ?? 0;
                    Render();
                    _settings.MapZoom = _zoom; _settings.MapPanX = _panT.X; _settings.MapPanY = _panT.Y;
                    _settings.ViewTime = (string)user["view_time"];
                    Store.SaveSettings(_settings);
                }
                else if (localNewer)
                {
                    var r = await _site.PostJson("save_view",
                        new { zoom = _zoom, panx = _panT.X, pany = _panT.Y });
                    _settings.ViewTime = (string)r["time"];
                    Store.SaveSettings(_settings);
                }
            }
            catch { }
        }

        async void PushDreamPos(Dream d)
        {
            if (_site == null || _siteRole == null || !_posMap.ContainsKey(d.Id)) return;
            try
            {
                var r = await _site.PostJson("save_positions", new { items = new[] {
                    new { id = _posMap[d.Id], x = d.PosX, y = d.PosY, z = d.PosZ } } });
                d.PosTime = (string)r["time"];   // серверное время — каноническое
                Store.SaveDreams(_dreams);
            }
            catch { }
        }

        async void PushPlanetPos(string key)
        {
            if (_site == null || _siteRole == null || !_planetPos.ContainsKey(key)) return;
            try
            {
                var pp = _planetPos[key];
                var r = await _site.PostJson("save_planet_positions", new { items = new[] {
                    new { loc = key, x = pp.X, y = pp.Y, z = pp.Z } } });
                pp.Time = (string)r["time"];
                Store.SavePlanets(_planetPos);
            }
            catch { }
        }

        // всё на карте синхронизируется по правилу «новее — главнее» (серверные штампы)
        // known — уже скачанный список снов: синхронизация снов отдаёт свой, чтобы не тянуть его снова
        async System.Threading.Tasks.Task SyncPositionsQuiet(Newtonsoft.Json.Linq.JObject known = null)
        {
            if (_site == null || _siteRole == null) return;
            try
            {
                var j = known ?? await _site.Get("dreams");
                _posMap.Clear();
                var siteDreams = (Newtonsoft.Json.Linq.JArray)j["dreams"];
                bool changed = false;
                var push = new List<Dream>();
                foreach (Newtonsoft.Json.Linq.JObject o in siteDreams)
                {
                    string ext = (string)o["ext_id"];
                    string localId = !string.IsNullOrEmpty(ext) ? ext : "web" + o["id"];
                    _posMap[localId] = (int)o["id"];
                    var local = _dreams.FirstOrDefault(x => x.Id == localId);
                    if (local == null) continue;
                    bool siteHas = o["pos_x"] != null && o["pos_x"].Type != Newtonsoft.Json.Linq.JTokenType.Null;
                    DateTime? siteT = ParseT((string)o["pos_time"]);
                    DateTime? localT = ParseT(local.PosTime);
                    bool localNewer = local.PosX.HasValue &&
                        (!siteHas || (localT.HasValue && (!siteT.HasValue || localT > siteT.Value.AddSeconds(1))));
                    bool siteNewer = siteHas &&
                        (!local.PosX.HasValue || (siteT.HasValue && (!localT.HasValue || siteT > localT.Value.AddSeconds(1))));
                    if (localNewer) push.Add(local);
                    else if (siteNewer)
                    {
                        local.PosX = (double)o["pos_x"];
                        local.PosY = (double)o["pos_y"];
                        local.PosZ = (double)o["pos_z"];
                        local.PosTime = (string)o["pos_time"];
                        changed = true;
                    }
                }
                if (push.Count > 0)
                {
                    var items = push.Select(d => (object)new
                        { id = _posMap[d.Id], x = d.PosX, y = d.PosY, z = d.PosZ }).ToList();
                    var r = await _site.PostJson("save_positions", new { items = items });
                    foreach (var d in push) d.PosTime = (string)r["time"];
                    changed = true;
                }

                // планеты — тем же правилом
                bool pChanged = false;
                var pPush = new List<string>();
                foreach (Newtonsoft.Json.Linq.JObject sp in
                    (Newtonsoft.Json.Linq.JArray)(j["planets"] ?? new Newtonsoft.Json.Linq.JArray()))
                {
                    string key = (string)sp["loc_key"];
                    bool siteHas = sp["x"] != null && sp["x"].Type != Newtonsoft.Json.Linq.JTokenType.Null;
                    DateTime? siteT = ParseT((string)sp["pos_time"]);
                    PlanetPos lp;
                    bool localHas = _planetPos.TryGetValue(key, out lp);
                    DateTime? localT = localHas ? ParseT(lp.Time) : null;
                    if (siteHas && (!localHas || (siteT.HasValue && (!localT.HasValue || siteT > localT.Value.AddSeconds(1)))))
                    {
                        _planetPos[key] = new PlanetPos
                        {
                            X = (double)sp["x"], Y = (double)sp["y"], Z = (double)sp["z"],
                            Time = (string)sp["pos_time"]
                        };
                        pChanged = true;
                    }
                    else if (localHas && (!siteHas || (localT.HasValue && (!siteT.HasValue || localT > siteT.Value.AddSeconds(1)))))
                        pPush.Add(key);
                }
                foreach (var kv in _planetPos)   // локальные планеты, которых сайт ещё не знает
                    if (!pPush.Contains(kv.Key) &&
                        !((Newtonsoft.Json.Linq.JArray)(j["planets"] ?? new Newtonsoft.Json.Linq.JArray()))
                            .Any(x => (string)x["loc_key"] == kv.Key))
                        pPush.Add(kv.Key);
                if (pPush.Count > 0)
                {
                    var items = pPush.Where(k => _planetPos.ContainsKey(k)).Select(k => (object)new
                        { loc = k, x = _planetPos[k].X, y = _planetPos[k].Y, z = _planetPos[k].Z }).ToList();
                    if (items.Count > 0)
                    {
                        var r = await _site.PostJson("save_planet_positions", new { items = items });
                        foreach (var k in pPush)
                            if (_planetPos.ContainsKey(k)) _planetPos[k].Time = (string)r["time"];
                        pChanged = true;
                    }
                }
                if (pChanged) Store.SavePlanets(_planetPos);
                if (changed) Store.SaveDreams(_dreams);
                if ((changed || pChanged) && _viewDreams == null) RebuildGraph();
            }
            catch { }
        }

        void OpenSite_Click(object sender, RoutedEventArgs e)
        {
            SUrl.Text = _settings.ServerUrl;
            SSiteLogin.Text = _settings.SiteLogin;
            SSitePass.Password = _settings.SitePass;
            SiteOverlay.Visibility = Visibility.Visible;
        }
        void CloseSite_Click(object sender, RoutedEventArgs e) { SiteOverlay.Visibility = Visibility.Collapsed; }

        async void SiteLogin_Click(object sender, RoutedEventArgs e) { await SiteAuth("login"); }
        async void SiteRegister_Click(object sender, RoutedEventArgs e) { await SiteAuth("register"); }

        async Task SiteAuth(string action)
        {
            try
            {
                SiteStatus.Text = "Подключаюсь…";
                _site = new SiteClient(SUrl.Text.Trim());
                var j = await _site.PostJson(action, new
                {
                    login = SSiteLogin.Text.Trim(),
                    pass = SSitePass.Password,
                    invite = SSiteInvite.Text.Trim()
                });
                _siteRole = (string)j["user"]["role"];
                _siteUid = (int)j["user"]["id"];
                ApplySiteColors(j["user"]);
                bool switched = !string.Equals(_settings.SiteLogin ?? "", SSiteLogin.Text.Trim(),
                    StringComparison.OrdinalIgnoreCase);
                _settings.ServerUrl = SUrl.Text.Trim();
                _settings.SiteLogin = SSiteLogin.Text.Trim();
                _settings.SitePass = SSitePass.Password;
                if (switched)
                {
                    // другой аккаунт — другой набор данных: сны участников не смешиваются
                    Store.SetAccount(_settings.SiteLogin, _settings);
                    _dreams = Store.LoadDreams();
                    _planetPos.Clear();
                    foreach (var kv in Store.LoadPlanets()) _planetPos[kv.Key] = kv.Value;
                    _pdfs = null; _pdfsMigrated = false; _suiteFiles = null; _suiteIcons.Clear();
                    _libIndexJson = null; _folders = null;   // раскладка папок — у каждого аккаунта своя
                    _pdfCovers.Clear();
                    _posMap.Clear();
                    _graves = Store.LoadGraves();   // у каждого аккаунта свой список удалённого
                    _viewDreams = null; _viewDreamer = null; _viewUid = -1; _cosmosMode = false;
                    _settings.MapZoom = 0; _settings.MapPanX = 0; _settings.MapPanY = 0;
                    _settings.ViewTime = "";   // вид возьмётся из аккаунта сайта
                    _yaw = 0; _pitch = 0;
                    _panT.X = 0; _panT.Y = 0;
                    RebuildGraph(); RenderList();
                }
                Store.SaveSettings(_settings);
                if (switched) await SyncViewQuiet(j["user"]);
                var roleNames = new Dictionary<string, string> {
                    { "user", "сновидец" }, { "moder", "модер" },
                    { "admin", "админ" }, { "owner", "владелец" } };
                SiteStatus.Text = "";
                SiteRoleText.Text = "✓ Вы вошли как " + _settings.SiteLogin + " · " +
                    (roleNames.ContainsKey(_siteRole) ? roleNames[_siteRole] : _siteRole);
                SitePanel.Visibility = Visibility.Visible;
                bool boss = RankOf(_siteRole) >= 2;
                SiteAdmin.Visibility = boss ? Visibility.Visible : Visibility.Collapsed;
                CosmosBtn.Visibility = boss ? Visibility.Visible : Visibility.Collapsed;
                ShowWho();
                await SyncPositionsQuiet();
            }
            catch (Exception ex) { SiteStatus.Text = ex.Message; _siteRole = null; }
        }

        Dream DreamFromSite(Newtonsoft.Json.Linq.JObject o)
        {
            var d = new Dream
            {
                Id = !string.IsNullOrEmpty((string)o["ext_id"]) ? (string)o["ext_id"] : "web" + o["id"],
                Title = (string)o["title"] ?? "Сон без имени",
                Date = (string)o["dream_date"] ?? "",
                Text = (string)o["text"] ?? "",
                ImagePrompt = (string)o["image_prompt"] ?? "",
                Links = new List<Link>(),
                PosX = o["pos_x"] != null && o["pos_x"].Type != Newtonsoft.Json.Linq.JTokenType.Null
                    ? (double?)(double)o["pos_x"] : null,
                PosY = o["pos_y"] != null && o["pos_y"].Type != Newtonsoft.Json.Linq.JTokenType.Null
                    ? (double?)(double)o["pos_y"] : null,
                PosZ = o["pos_z"] != null && o["pos_z"].Type != Newtonsoft.Json.Linq.JTokenType.Null
                    ? (double?)(double)o["pos_z"] : null,
                PosTime = (string)o["pos_time"]
            };
            if (!string.IsNullOrEmpty((string)o["summary"]) || !string.IsNullOrEmpty((string)o["location"]))
                d.Analysis = new Analysis
                {
                    Summary = (string)o["summary"] ?? "",
                    Location = ShortLoc((string)o["location"]),
                    Characters = o["characters"].ToObject<List<string>>() ?? new List<string>(),
                    Emotions = o["emotions"].ToObject<List<string>>() ?? new List<string>(),
                    Symbols = o["symbols"].ToObject<List<string>>() ?? new List<string>(),
                    Motifs = o["motifs"].ToObject<List<string>>() ?? new List<string>()
                };
            return d;
        }

        // локальное имя = серверное (уже случайный хеш): без смысловых имён и с рабочим кэшем
        async Task<string> FetchSiteImage(string file)
        {
            string localName = System.IO.Path.GetFileName(file);
            string dst = System.IO.Path.Combine(Store.ImagesDir, localName);
            if (!System.IO.File.Exists(dst))
            {
                var bytes = await _site.Download("api.php?action=img&f=" + Uri.EscapeDataString(file));
                System.IO.File.WriteAllBytes(dst, bytes);
            }
            return localName;
        }

        async void SyncDreams_Click(object sender, RoutedEventArgs e) { await SyncDreamsAsync(); }
        async void SyncBooks_Click(object sender, RoutedEventArgs e) { await SyncBooksAsync(); }

        // всё с сайта разом: сны и нити, позиции и вид, книги, PDF, палитра, ларец
        async void SyncAll_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null) { Toast("Сначала войдите"); return; }
            SyncAllBtn.IsEnabled = false;
            SyncBegin("Синхронизация всего");
            try
            {
                SiteStatus.Text = "Синхронизирую всё…";
                SyncPart(0, 0.5);
                bool dreamsOk = await SyncDreamsAsync(quiet: true);
                SyncPart(0.5, 0.9);
                await SyncBooksAsync(quiet: true);
                SyncPart(0.9, 1);
                SyncStep("палитра, вид карты, ларец даров", 0.1);
                try
                {
                    var me = await _site.Get("me");   // палитра и личный вид карты
                    ApplySiteColors(me["user"]);
                    await SyncViewQuiet(me["user"]);
                }
                catch { }
                if (!dreamsOk) await SyncPositionsQuiet();   // иначе позиции уже сверены
                await LoadFoldersQuiet();
                await CheckGiftsQuiet();
                // сюита — только у владельца; остальным она приходит дарами
                int suite = -1;
                if (_siteRole == "owner")
                    try { suite = ((Newtonsoft.Json.Linq.JArray)(await _site.Get("files_list"))["files"]).Count; }
                    catch { }
                // космос — от модера и выше: обновляем список сновидцев, если он открыт
                if (RankOf(_siteRole) >= 2 && _cosmosMode)
                    try
                    {
                        var cj = await _site.Get("cosmos");
                        _cosmosUsers = (Newtonsoft.Json.Linq.JArray)cj["users"];
                        _cosmosBridges = (Newtonsoft.Json.Linq.JArray)cj["bridges"];
                    }
                    catch { }
                RebuildGraph(); RenderList();
                if (LibOverlay.Visibility == Visibility.Visible) RenderShelves();
                SiteStatus.Text = "";
                string tail = RankOf(_siteRole) >= 2 ? ", космос" : "";
                if (suite >= 0) tail += ", сюита на сайте: " + suite;
                Toast("Синхронизировано по вашему доступу (" + RoleName(_siteRole) + "): " +
                      "сны и нити, позиции и вид карты, книги, PDF, палитра, ларец" + tail);
            }
            catch (Exception ex) { SiteStatus.Text = ""; Toast("Синхронизация: " + ex.Message); SyncFail(ex.Message); }
            finally { SyncEnd(); }
            SyncAllBtn.IsEnabled = true;
        }

        // true — сны сверены до конца (заодно сверены и позиции)
        async Task<bool> SyncDreamsAsync(bool quiet = false)
        {
            if (_site == null || _siteRole == null) { Toast("Сначала войдите"); return false; }
            SyncBegin("Синхронизация снов");
            try
            {
                SiteStatus.Text = "Синхронизирую сны…";
                SyncStep("сны: сверяю список с сайтом", 0.02);
                var j = await _site.Get("dreams");
                var siteDreams = (Newtonsoft.Json.Linq.JArray)j["dreams"];
                var siteLinks = (Newtonsoft.Json.Linq.JArray)j["links"];

                var siteByExt = new Dictionary<string, Newtonsoft.Json.Linq.JObject>();
                var siteIds = new HashSet<string>();
                foreach (Newtonsoft.Json.Linq.JObject o in siteDreams)
                {
                    siteIds.Add(o["id"].ToString());
                    string ext = (string)o["ext_id"];
                    if (!string.IsNullOrEmpty(ext)) siteByExt[ext] = o;
                }

                // 1) наверх: локальные сны, которых нет на сайте
                var toPush = _dreams.Where(d =>
                    !siteByExt.ContainsKey(d.Id) &&
                    !(d.Id.StartsWith("web") && siteIds.Contains(d.Id.Substring(3)))).ToList();
                int pushed = 0;
                if (toPush.Count > 0)
                {
                    SyncStep("сны: отправляю на сайт новые — " + toPush.Count, 0.1);
                    var payload = Newtonsoft.Json.JsonConvert.SerializeObject(toPush);
                    var images = new List<Tuple<string, byte[]>>();
                    foreach (var d in toPush)
                    {
                        string p = Store.ImagePath(d);
                        if (p != null) images.Add(Tuple.Create(d.ImageFile, System.IO.File.ReadAllBytes(p)));
                    }
                    var r = await _site.Upload("import", "dreams", "dreams.json",
                        System.Text.Encoding.UTF8.GetBytes(payload), images);
                    pushed = (int)r["added"];
                    // перечитываем карту сайта: новым снам нужны их id для позиций
                    j = await _site.Get("dreams");
                    siteDreams = (Newtonsoft.Json.Linq.JArray)j["dreams"];
                    siteLinks = (Newtonsoft.Json.Linq.JArray)j["links"];
                    siteByExt.Clear(); siteIds.Clear();
                    foreach (Newtonsoft.Json.Linq.JObject o in siteDreams)
                    {
                        siteIds.Add(o["id"].ToString());
                        string ext2 = (string)o["ext_id"];
                        if (!string.IsNullOrEmpty(ext2)) siteByExt[ext2] = o;
                    }
                }

                // позиции синхронизируются отдельно, по правилу «новее — главнее»

                // 2) вниз: сны сайта, которых нет локально
                int pulled = 0;
                var siteIdToLocal = new Dictionary<string, string>();
                int si = 0, sn = Math.Max(1, siteDreams.Count);
                foreach (Newtonsoft.Json.Linq.JObject o in siteDreams)
                {
                    SyncStep("сны: сверяю с сайтом " + (++si) + " из " + siteDreams.Count, 0.3 + 0.3 * si / sn);
                    string ext = (string)o["ext_id"];
                    string localId = !string.IsNullOrEmpty(ext) ? ext : "web" + o["id"];
                    if (_graves.Contains(localId))   // удалён здесь — доводим удаление до сайта
                    {
                        try { await _site.PostJson("del_dream", new { id = (int)o["id"] }); }
                        catch { }
                        continue;
                    }
                    siteIdToLocal[o["id"].ToString()] = localId;
                    _posMap[localId] = (int)o["id"];
                    var existing = _dreams.FirstOrDefault(x => x.Id == localId);
                    if (existing != null) continue;   // позиции сверит SyncPositionsQuiet
                    var nd = DreamFromSite(o);
                    string img = (string)o["image_file"];
                    if (!string.IsNullOrEmpty(img))
                        try { nd.ImageFile = await FetchSiteImage(img); }
                        catch { }
                    _dreams.Add(nd);
                    pulled++;
                }

                // 3) нити с сайта, которых нет локально
                foreach (Newtonsoft.Json.Linq.JObject l in siteLinks)
                {
                    string la, lb;
                    if (!siteIdToLocal.TryGetValue(l["dream_a"].ToString(), out la) ||
                        !siteIdToLocal.TryGetValue(l["dream_b"].ToString(), out lb)) continue;
                    var da = _dreams.FirstOrDefault(x => x.Id == la);
                    var db = _dreams.FirstOrDefault(x => x.Id == lb);
                    if (da == null || db == null) continue;
                    string type = (string)l["type"];
                    bool exists =
                        (da.Links != null && da.Links.Any(x => x.Id == lb && x.Type == type)) ||
                        (db.Links != null && db.Links.Any(x => x.Id == la && x.Type == type));
                    if (!exists)
                    {
                        if (da.Links == null) da.Links = new List<Link>();
                        da.Links.Add(new Link { Id = lb, Type = type, Reason = (string)l["reason"] ?? "" });
                    }
                }

                // 3.5) картины к уже существующим снам: чего нет на одной стороне —
                //      берётся с другой (импорт возит картины только новых снов)
                int imgUp = 0, imgDown = 0, ii = 0;
                foreach (Newtonsoft.Json.Linq.JObject o in siteDreams)
                {
                    SyncStep("картины: сверяю " + (++ii) + " из " + siteDreams.Count, 0.6 + 0.2 * ii / sn);
                    string lid;
                    if (!siteIdToLocal.TryGetValue(o["id"].ToString(), out lid)) continue;
                    var ld = _dreams.FirstOrDefault(x => x.Id == lid);
                    if (ld == null) continue;
                    string siteImg = (string)o["image_file"] ?? "";
                    bool hasLocal = !string.IsNullOrEmpty(ld.ImageFile) && Store.ImagePath(ld) != null;

                    if (siteImg.Length == 0 && hasLocal)          // наверх
                    {
                        try
                        {
                            await _site.Upload("set_image", "image", ld.ImageFile,
                                System.IO.File.ReadAllBytes(Store.ImagePath(ld)), null,
                                new Dictionary<string, string> { { "id", o["id"].ToString() } },
                                "image/jpeg");
                            imgUp++;
                        }
                        catch { }
                    }
                    else if (siteImg.Length > 0 && !hasLocal)     // вниз
                    {
                        try { ld.ImageFile = await FetchSiteImage(siteImg); imgDown++; }
                        catch { }
                    }
                }

                // 4) нити наверх: локальные связи, которых ещё нет на сайте
                //    (импорт вяжет только сны своей партии — прежде созданные нити не уезжали)
                int linksUp = 0;
                var newLinks = new List<object>();
                var onSite = new HashSet<string>();
                foreach (Newtonsoft.Json.Linq.JObject l in siteLinks)
                {
                    int sa = (int)l["dream_a"], sb2 = (int)l["dream_b"];
                    onSite.Add(Math.Min(sa, sb2) + "|" + Math.Max(sa, sb2) + "|" + (string)l["type"]);
                }
                foreach (var d in _dreams)
                {
                    if (d.Links == null || d.Links.Count == 0) continue;
                    int aId;
                    if (!_posMap.TryGetValue(d.Id, out aId)) continue;   // сна ещё нет на сайте
                    foreach (var l in d.Links)
                    {
                        int bId;
                        if (string.IsNullOrEmpty(l.Id) || !_posMap.TryGetValue(l.Id, out bId)) continue;
                        if (aId == bId) continue;
                        string key = Math.Min(aId, bId) + "|" + Math.Max(aId, bId) + "|" + l.Type;
                        if (!onSite.Add(key)) continue;   // уже есть на сайте либо повтор
                        newLinks.Add(new { a = aId, b = bId, type = l.Type, reason = l.Reason ?? "" });
                    }
                }
                // все новые нити — одним запросом на каждую сотню, а не запросом на каждую
                if (newLinks.Count > 0) SyncStep("нити: отправляю на сайт — " + newLinks.Count, 0.85);
                for (int i = 0; i < newLinks.Count; i += 100)
                {
                    try
                    {
                        var r = await _site.PostJson("add_links",
                            new { items = newLinks.Skip(i).Take(100).ToList() });
                        linksUp += (int?)r["added"] ?? 0;
                    }
                    catch { }
                }

                _dreams.Sort((a, b) => string.CompareOrdinal(a.Date ?? "", b.Date ?? ""));
                Store.SaveDreams(_dreams);
                SyncStep("места снов на карте", 0.93);
                await SyncPositionsQuiet(j);   // тот же список снов — по правилу «новее — главнее»
                RebuildGraph(); RenderList();
                SiteStatus.Text = "";
                if (!quiet) Toast("Сны: на сайт → " + pushed + ", с сайта ← " + pulled +
                    (linksUp > 0 ? ", нитей наверх → " + linksUp : "") +
                    (imgUp + imgDown > 0 ? ", картин ↑" + imgUp + " ↓" + imgDown : ""));
                SyncStep("сны сверены", 1);
                return true;
            }
            catch (Exception ex)
            {
                SiteStatus.Text = ""; Toast("Синхронизация снов: " + ex.Message);
                SyncFail("сны: " + ex.Message);
            }
            finally { SyncEnd(); }
            return false;
        }

        async Task SyncBooksAsync(bool quiet = false)
        {
            if (_site == null || _siteRole == null) { Toast("Сначала войдите"); return; }
            SyncBegin("Синхронизация книг");
            try
            {
                string path = !string.IsNullOrEmpty(_booksPath) ? _booksPath : DefaultBooksPath;
                if (!System.IO.File.Exists(path)) { Toast("Не найден books.json мода"); return; }
                if (_books == null || _booksPath != path)
                {
                    _books = Newtonsoft.Json.Linq.JArray.Parse(System.IO.File.ReadAllText(path));
                    _booksPath = path;
                }
                SiteStatus.Text = "Синхронизирую книги…";
                SyncStep("книги: отправляю библиотеку на сайт", 0.05);

                // наверх: моя библиотека на сайте = книги мода с этой машины
                await _site.Upload("books_import", "books", "books.json",
                    System.Text.Encoding.UTF8.GetBytes(_books.ToString()));
                StripLocalSeals();   // печати теперь на сервере — локальные тексты чистые

                // вниз: новые книги (в т.ч. переданные по иерархии) и трактовки
                SyncStep("книги: беру с сайта новые и трактовки", 0.2);
                var j = await _site.Get("books_list");
                int gainedTr = 0, gainedBooks = 0;
                foreach (Newtonsoft.Json.Linq.JObject sb in (Newtonsoft.Json.Linq.JArray)j["books"])
                {
                    Newtonsoft.Json.Linq.JObject local = null;
                    foreach (Newtonsoft.Json.Linq.JObject lb in _books)
                        if ((int)lb["num"] == (int)sb["num"]) { local = lb; break; }
                    if (local == null)
                    {
                        _books.Add(new Newtonsoft.Json.Linq.JObject
                        {
                            ["num"] = (int)sb["num"],
                            ["title"] = (string)sb["title"],
                            ["text"] = (string)sb["text"] ?? "",
                            ["size"] = 34,
                            ["per_page"] = 600,
                            ["translation"] = (string)sb["translation"] ?? ""
                        });
                        gainedBooks++;
                        continue;
                    }
                    string tr = (string)sb["translation"];
                    if (!string.IsNullOrEmpty(tr) && string.IsNullOrEmpty((string)local["translation"]))
                    {
                        local["translation"] = tr;
                        gainedTr++;
                    }
                    // фундамент планеты хранится на сайте — подтягиваем для отрисовки
                    string sloc = (string)sb["location"] ?? "";
                    if (((string)local["location"] ?? "") != sloc)
                    {
                        local["location"] = sloc;
                        gainedBooks++;   // общий флаг «есть что сохранить»
                    }
                }
                if (gainedBooks > 0 || gainedTr > 0)
                    System.IO.File.WriteAllText(_booksPath,
                        _books.ToString(Newtonsoft.Json.Formatting.Indented));
                FillKeys();

                // PDF: наверх свои, вниз новые (в т.ч. переданные по иерархии)
                EnsurePdfs();
                SyncStep("PDF: сверяю список", 0.35);
                var pj = await _site.Get("pdfs_list");
                var sitePdfs = (Newtonsoft.Json.Linq.JArray)pj["pdfs"];
                var siteExt = new HashSet<string>();
                foreach (Newtonsoft.Json.Linq.JObject sp in sitePdfs)
                    if (!string.IsNullOrEmpty((string)sp["ext_id"])) siteExt.Add((string)sp["ext_id"]);
                int pdfUp = 0, pdfDown = 0;
                var upList = _pdfs.Where(x => !siteExt.Contains(x.Id) && !x.Id.StartsWith("webp")).ToList();
                foreach (var lp in upList)
                {
                    SyncStep("PDF: отправляю «" + lp.Title + "» — " + (pdfUp + 1) + " из " + upList.Count,
                             0.4 + 0.25 * pdfUp / Math.Max(1, upList.Count));
                    string pdfPath = Store.PdfPath(lp);
                    if (!System.IO.File.Exists(pdfPath)) continue;
                    byte[] plain;
                    try { plain = Store.ReadPdf(lp); } catch { continue; }   // расшифровка в память
                    await _site.Upload("pdf_add", "pdf", lp.Id + ".pdf",
                        plain, null,
                        new Dictionary<string, string> { { "title", lp.Title }, { "ext_id", lp.Id } },
                        "application/pdf");
                    pdfUp++;
                }
                int downTotal = sitePdfs.Count(x =>
                {
                    string e2 = (string)x["ext_id"];
                    string id2 = !string.IsNullOrEmpty(e2) ? e2 : "webp" + x["id"];
                    return !_pdfs.Any(y => y.Id == id2);
                });
                foreach (Newtonsoft.Json.Linq.JObject sp in sitePdfs)
                {
                    string ext = (string)sp["ext_id"];
                    string localId = !string.IsNullOrEmpty(ext) ? ext : "webp" + sp["id"];
                    int lastPage = (int)(sp["last_page"] ?? 0);
                    if (_pdfs.Any(x => x.Id == localId))
                    {
                        // на этой машине памяти ещё нет — берём серверную закладку
                        if (lastPage > 0 && _settings.PdfPage != null &&
                            !_settings.PdfPage.ContainsKey(localId))
                        { _settings.PdfPage[localId] = lastPage; Store.SaveSettings(_settings); }
                        continue;
                    }
                    SyncStep("PDF: загружаю «" + (string)sp["title"] + "» — " + (pdfDown + 1) + " из " + downTotal,
                             0.65 + 0.33 * pdfDown / Math.Max(1, downTotal));
                    var bytes = await _site.Download("api.php?action=pdf_file&id=" + sp["id"]);
                    string file = Store.StashPdf(localId, bytes);   // на диск — зашифрованным
                    _pdfs.Add(new PdfBook { Id = localId, Title = (string)sp["title"],
                        File = file, LastPage = lastPage });
                    if (lastPage > 0)
                    {
                        if (_settings.PdfPage == null) _settings.PdfPage = new Dictionary<string, int>();
                        if (!_settings.PdfPage.ContainsKey(localId)) _settings.PdfPage[localId] = lastPage;
                    }
                    pdfDown++;
                }
                if (pdfUp > 0 || pdfDown > 0) Store.SavePdfs(_pdfs);

                if (LibOverlay.Visibility == Visibility.Visible) RenderShelves();
                SiteStatus.Text = "";
                if (!quiet)
                    Toast("Книги: новых — " + gainedBooks + ", трактовок — " + gainedTr +
                          "; PDF: на сайт → " + pdfUp + ", с сайта ← " + pdfDown);
            }
            catch (Exception ex)
            {
                SiteStatus.Text = ""; Toast("Синхронизация книг: " + ex.Message);
                SyncFail("книги: " + ex.Message);
            }
            finally { SyncEnd(); }
        }

        // космос: кнопка ходит по кругу — моя карта → космос; карта сновидца → космос; космос → моя
        async void Cosmos_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null || RankOf(_siteRole) < 2)
            { Toast("Космос открыт модераторам и выше — войдите на сайт (⛅ Сайт)"); return; }
            if (_cosmosMode) { MyMap_Click(null, null); return; }
            try
            {
                var j = await _site.Get("cosmos");
                _cosmosUsers = (Newtonsoft.Json.Linq.JArray)j["users"];
                _cosmosBridges = (Newtonsoft.Json.Linq.JArray)j["bridges"];
                _viewDreams = null; _viewDreamer = null; _viewUid = -1;
                _cosmosMode = true;
                SiteOverlay.Visibility = Visibility.Collapsed;
                CloseLeft_Click(null, null); CloseRight_Click(null, null);
                RebuildGraph();
                Toast("Космос: клик по сновидцу открывает его карту. Назад — «✦ Космос»");
            }
            catch (Exception ex) { Toast("Космос: " + ex.Message); }
        }

        // вход в карту сновидца — строго по иерархии (сервер проверяет ещё раз)
        async void OpenUserMap(int uid)
        {
            if (_site == null || _siteRole == null) return;
            if (uid == _siteUid) { MyMap_Click(null, null); return; }
            if (_cosmosUsers != null)
            {
                var cu = _cosmosUsers.FirstOrDefault(x => (int)x["id"] == uid);
                if (cu != null && RankOf(_siteRole) <= RankOf((string)cu["role"]))
                { Toast("Карта «" + (string)cu["login"] + "» вам недоступна"); return; }
            }
            try
            {
                var j = await _site.Get("user_map&uid=" + uid);
                var list = new List<Dream>();
                _viewPosMap.Clear();
                foreach (Newtonsoft.Json.Linq.JObject o in (Newtonsoft.Json.Linq.JArray)j["dreams"])
                {
                    var nd = DreamFromSite(o);
                    nd.Id = "view" + o["id"];
                    _viewPosMap[nd.Id] = (int)o["id"];
                    string img = (string)o["image_file"];
                    if (!string.IsNullOrEmpty(img))
                        try { nd.ImageFile = await FetchSiteImage(img); }
                        catch { }
                    list.Add(nd);
                }
                foreach (Newtonsoft.Json.Linq.JObject l in (Newtonsoft.Json.Linq.JArray)j["links"])
                {
                    var da = list.FirstOrDefault(x => x.Id == "view" + l["dream_a"]);
                    if (da != null)
                        da.Links.Add(new Link { Id = "view" + l["dream_b"],
                            Type = (string)l["type"], Reason = (string)l["reason"] ?? "" });
                }
                _viewPlanetPos.Clear();
                foreach (Newtonsoft.Json.Linq.JObject p in
                    (Newtonsoft.Json.Linq.JArray)(j["planets"] ?? new Newtonsoft.Json.Linq.JArray()))
                    if (p["x"] != null && p["x"].Type != Newtonsoft.Json.Linq.JTokenType.Null)
                        _viewPlanetPos[(string)p["loc_key"]] = new PlanetPos
                        { X = (double)p["x"], Y = (double)p["y"], Z = (double)p["z"] };
                _viewFounded.Clear();
                foreach (var f in (Newtonsoft.Json.Linq.JArray)(j["founded"] ?? new Newtonsoft.Json.Linq.JArray()))
                    _viewFounded.Add((string)f);
                _viewDreams = list;
                _viewDreamer = (string)j["user"]["login"];
                _viewUid = uid;
                _cosmosMode = false;
                RebuildGraph(); RenderList();
                Toast("Карта сновидца «" + _viewDreamer + "»: расстановку можно править — она сохранится ему. Назад — «✦ Космос»");
            }
            catch (Exception ex) { Toast("Карта сновидца: " + ex.Message); }
        }

        // правки на чужой карте: сервер пускает только вышестоящих над её владельцем
        async void PushForeignDream(Dream d)
        {
            if (_site == null || _viewUid <= 0 || !_viewPosMap.ContainsKey(d.Id)) return;
            try
            {
                await _site.PostJson("save_positions", new { uid = _viewUid, items = new[] {
                    new { id = _viewPosMap[d.Id], x = d.PosX, y = d.PosY, z = d.PosZ } } });
            }
            catch (Exception ex) { Toast("Позиция: " + ex.Message); }
        }

        async void PushForeignPlanet(string key)
        {
            if (_site == null || _viewUid <= 0 || !_viewPlanetPos.ContainsKey(key)) return;
            try
            {
                var pp = _viewPlanetPos[key];
                await _site.PostJson("save_planet_positions", new { uid = _viewUid, items = new[] {
                    new { loc = key, x = pp.X, y = pp.Y, z = pp.Z } } });
            }
            catch (Exception ex) { Toast("Позиция: " + ex.Message); }
        }

        void MyMap_Click(object sender, RoutedEventArgs e)
        {
            _viewDreams = null; _viewDreamer = null; _viewUid = -1; _cosmosMode = false;
            SiteOverlay.Visibility = Visibility.Collapsed;
            RebuildGraph(); RenderList();
        }
    }
}
