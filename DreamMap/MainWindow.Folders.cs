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
        /* ===== полки-папки: живут на сайте, здесь показываются и наполняются ===== */
        Newtonsoft.Json.Linq.JArray _folders;
        int? _curFolder;                       // null — общая полка
        bool _picking;
        readonly HashSet<string> _picked = new HashSet<string>();
        readonly Dictionary<int, int?> _bookFolder = new Dictionary<int, int?>();     // num  → папка
        readonly Dictionary<string, int?> _pdfFolder = new Dictionary<string, int?>(); // ext_id → папка
        readonly Dictionary<int, int> _bookSiteId = new Dictionary<int, int>();        // num  → id на сайте
        readonly Dictionary<string, int> _pdfSiteId = new Dictionary<string, int>();

        /* Раскладка по папкам живёт на сайте, но её последний вид хранится в профиле:
           библиотека сразу открывается такой, какой была, а сайт сверяется тихо. Без этого
           полка на миг показывала всё вперемешку — вещи из папок лежали на общей полке. */
        string _libIndexJson;                  // раскладка, по которой полка нарисована сейчас

        static string LibIndexFile { get { return System.IO.Path.Combine(Store.Dir, "lib_index.json"); } }

        // раскладка из профиля — если в памяти её ещё нет (первое открытие после запуска)
        void LoadFoldersCached()
        {
            if (_libIndexJson != null) return;
            try
            {
                if (!System.IO.File.Exists(LibIndexFile)) return;
                string json = System.IO.File.ReadAllText(LibIndexFile);
                ApplyLibIndex(Newtonsoft.Json.Linq.JObject.Parse(json));
                _libIndexJson = json;
            }
            catch { }
        }

        // true — раскладка на сайте отличается от той, что сейчас на экране
        async Task<bool> LoadFoldersQuiet()
        {
            if (_site == null || _siteRole == null) return false;
            try
            {
                // один лёгкий вызов: без текстов книг, только раскладка
                var ix = await _site.Get("lib_index");
                string json = ix.ToString(Newtonsoft.Json.Formatting.None);
                if (json == _libIndexJson) return false;
                ApplyLibIndex(ix);
                _libIndexJson = json;
                try { System.IO.File.WriteAllText(LibIndexFile, json); } catch { }
                return true;
            }
            catch { return false; }   // нет связи — остаётся прежняя раскладка
        }

        void ApplyLibIndex(Newtonsoft.Json.Linq.JObject ix)
        {
            _bookFolder.Clear(); _pdfFolder.Clear();
            _bookSiteId.Clear(); _pdfSiteId.Clear();
            _folders = (Newtonsoft.Json.Linq.JArray)ix["folders"];
            foreach (Newtonsoft.Json.Linq.JObject b in (Newtonsoft.Json.Linq.JArray)ix["books"])
            {
                int num = (int)(b["num"] ?? -1);
                if (num < 0) continue;
                _bookFolder[num] = JInt(b["folder_id"]);
                _bookSiteId[num] = (int)b["id"];
            }
            foreach (Newtonsoft.Json.Linq.JObject p in (Newtonsoft.Json.Linq.JArray)ix["pdfs"])
            {
                string ext = (string)p["ext_id"];
                if (string.IsNullOrEmpty(ext)) ext = "webp" + p["id"];
                _pdfFolder[ext] = JInt(p["folder_id"]);
                _pdfSiteId[ext] = (int)p["id"];
            }
            _suiteFiles = (Newtonsoft.Json.Linq.JArray)ix["files"];
        }

        static int? JInt(Newtonsoft.Json.Linq.JToken t)
        {
            return t == null || t.Type == Newtonsoft.Json.Linq.JTokenType.Null ? (int?)null : (int)t;
        }

        /* род папок текущей вкладки: у иероглифов, PDF и сюиты папки свои */
        string LibKind() { return _libMode == 2 ? "file" : (_libMode == 1 ? "pdf" : "book"); }

        IEnumerable<Newtonsoft.Json.Linq.JObject> KindFolders()
        {
            if (_folders == null) yield break;
            string k = LibKind();
            foreach (Newtonsoft.Json.Linq.JObject f in _folders)
                if ((string)f["kind"] == k) yield return f;
        }

        // счётчик считается по местной раскладке — без походов на сервер
        int FolderCount(Newtonsoft.Json.Linq.JObject f)
        {
            string k = (string)f["kind"];
            int id = (int)f["id"], n = 0;
            if (k == "book") { foreach (var v in _bookFolder.Values) if (v == id) n++; }
            else if (k == "pdf") { foreach (var v in _pdfFolder.Values) if (v == id) n++; }
            else if (_suiteFiles != null)
                foreach (Newtonsoft.Json.Linq.JObject sf in _suiteFiles)
                    if (JInt(sf["folder_id"]) == id) n++;
            return n;
        }

        string KindWord(int n)
        {
            string[] w = LibKind() == "book" ? new[] { "книга", "книги", "книг" }
                : LibKind() == "pdf" ? new[] { "том", "тома", "томов" }
                : new[] { "вещь", "вещи", "вещей" };
            int m = n % 100, d = n % 10;
            return n + " " + (m > 10 && m < 15 ? w[2] : d == 1 ? w[0] : d > 1 && d < 5 ? w[1] : w[2]);
        }

        /* шапка открытой папки и кнопка отбора */
        void RenderFolderChrome()
        {
            bool online = _site != null && _siteRole != null;
            PickBtn.Visibility = online ? Visibility.Visible : Visibility.Collapsed;
            PickBtn.Style = (Style)FindResource(_picking ? "Primary" : "Btn");
            var f = CurFolderObj();
            if (f == null) { FolderHead.Visibility = Visibility.Collapsed; return; }
            FolderHead.Visibility = Visibility.Visible;
            FolderHeadName.Text = "🗀 " + (string)f["name"];
            FolderHeadCount.Text = KindWord(FolderCount(f));
        }

        /* папки стоят на полке рядом с книгами — карточками с язычком */
        void AddFolderCards()
        {
            if (_curFolder != null) return;
            foreach (var f in KindFolders())
            {
                int id = (int)f["id"];
                Shelves.Children.Add(FolderCard("🗀", (string)f["name"], KindWord(FolderCount(f)),
                    false, (s, e) => { _curFolder = id; _picked.Clear(); RenderFolderChrome(); RenderShelves(); }));
            }
            if (_site != null && _siteRole != null)
                Shelves.Children.Add(FolderCard("➕", "Новая папка", "",
                    true, async (s, e) => await NewFolder()));
        }

        FrameworkElement FolderCard(string icon, string title, string sub, bool ghost,
            MouseButtonEventHandler onClick)
        {
            var stack = new StackPanel { Margin = new Thickness(8, 12, 8, 0), Width = 108 };
            var card = new Border
            {
                Height = 128, CornerRadius = new CornerRadius(4, 12, 12, 12),
                Cursor = Cursors.Hand, Margin = new Thickness(0, 10, 0, 0),
                BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                    ghost ? "#556D5FB0" : "#B9975A")),
                BorderThickness = new Thickness(1, 2, 1, 1),
                Effect = new DropShadowEffect { BlurRadius = 12, ShadowDepth = 3, Opacity = .5 }
            };
            var g = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(.6, 1) };
            if (ghost)
            {
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#2B2352"), 0));
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#161030"), 1));
            }
            else
            {
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#4A3B22"), 0));
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#241A34"), .7));
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#1A1338"), 1));
            }
            card.Background = g;
            var inner = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8) };
            inner.Children.Add(new TextBlock
            {
                Text = icon, FontSize = 26, HorizontalAlignment = HorizontalAlignment.Center,
                FontFamily = new FontFamily("Segoe UI Symbol, Segoe UI"),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                    ghost ? "#A99EF0" : "#FCD34D")),
                Effect = ghost ? null : new DropShadowEffect
                { Color = (Color)ColorConverter.ConvertFromString("#FCD34D"),
                  BlurRadius = 16, ShadowDepth = 0, Opacity = .45 }
            });
            inner.Children.Add(new TextBlock
            {
                Text = title, TextWrapping = TextWrapping.Wrap, FontSize = 12,
                TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 6, 0, 0),
                Foreground = ghost ? (Brush)FindResource("DimBrush") : (Brush)FindResource("TextBrush")
            });
            if (sub != "")
                inner.Children.Add(new TextBlock
                {
                    Text = sub, FontSize = 10, TextAlignment = TextAlignment.Center,
                    Margin = new Thickness(0, 5, 0, 0), Foreground = (Brush)FindResource("FaintBrush")
                });
            card.Child = inner;
            card.MouseLeftButtonUp += onClick;

            var wrap = new Grid();
            wrap.Children.Add(card);
            if (!ghost)   // язычок папки
                wrap.Children.Add(new Border
                {
                    Width = 44, Height = 12, HorizontalAlignment = HorizontalAlignment.Left,
                    VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, -1, 0, 0),
                    CornerRadius = new CornerRadius(7, 8, 0, 0), IsHitTestVisible = false,
                    BorderThickness = new Thickness(1, 1, 1, 0),
                    BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#B9975A")),
                    Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#57462A"))
                });
            stack.Children.Add(wrap);
            stack.Children.Add(new Border
            {
                Height = 6, Margin = new Thickness(-6, 0, -6, 0), CornerRadius = new CornerRadius(3),
                Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2A1F5C"))
            });
            return stack;
        }

        void FolderBack_Click(object sender, RoutedEventArgs e)
        { _curFolder = null; _picked.Clear(); RenderFolderChrome(); RenderShelves(); }

        async void FolderRename_Click(object sender, RoutedEventArgs e) { await RenameFolder(); }
        async void FolderDel_Click(object sender, RoutedEventArgs e) { await DelFolder(); }
        void PickToggle_Click(object sender, RoutedEventArgs e) { TogglePick(); }

        async Task NewFolder()
        {
            string name = AskWindow.Text(this, "Новая папка", "Имя папки на этой полке:");
            if (string.IsNullOrWhiteSpace(name)) return;
            try
            {
                var r = await _site.PostJson("folder_create", new { name = name.Trim(), kind = LibKind() });
                if (_folders == null) _folders = new Newtonsoft.Json.Linq.JArray();
                _folders.Add(new Newtonsoft.Json.Linq.JObject
                { ["id"] = (int)r["id"], ["name"] = (string)r["name"], ["kind"] = (string)r["kind"] });
                RenderFolderChrome(); RenderShelves();
                Toast("Папка «" + name.Trim() + "» заведена");
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        Newtonsoft.Json.Linq.JObject CurFolderObj()
        {
            if (_folders == null || _curFolder == null) return null;
            foreach (Newtonsoft.Json.Linq.JObject f in _folders)
                if ((int)f["id"] == _curFolder.Value) return f;
            return null;
        }

        async Task RenameFolder()
        {
            var f = CurFolderObj(); if (f == null) return;
            string name = AskWindow.Text(this, "Переименование папки",
                "Новое имя папки:", (string)f["name"]);
            if (string.IsNullOrWhiteSpace(name)) return;
            try { await _site.PostJson("folder_rename", new { id = (int)f["id"], name = name.Trim() });
                f["name"] = name.Trim(); RenderFolderChrome(); RenderShelves(); }
            catch (Exception ex) { Toast(ex.Message); }
        }

        async Task DelFolder()
        {
            var f = CurFolderObj(); if (f == null) return;
            if (MessageBox.Show("Убрать папку «" + (string)f["name"] + "»?\n\n" +
                "Всё, что в ней лежит, вернётся на общую полку.",
                "Полка", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            try
            {
                var r = await _site.PostJson("folder_del", new { id = (int)f["id"] });
                Toast("Папка убрана, на полку вернулось: " + (int)r["freed"]);
                int fid = (int)f["id"];
                _folders.Remove(f);
                foreach (var k in new List<int>(_bookFolder.Keys))
                    if (_bookFolder[k] == fid) _bookFolder[k] = null;
                foreach (var k in new List<string>(_pdfFolder.Keys))
                    if (_pdfFolder[k] == fid) _pdfFolder[k] = null;
                if (_suiteFiles != null)
                    foreach (Newtonsoft.Json.Linq.JObject sf in _suiteFiles)
                        if (JInt(sf["folder_id"]) == fid) sf["folder_id"] = null;
                _curFolder = null;
                RenderFolderChrome(); RenderShelves();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        void TogglePick()
        {
            _picking = !_picking;
            _picked.Clear();
            PickBar.Visibility = _picking ? Visibility.Visible : Visibility.Collapsed;
            if (_picking)
            {
                PickTarget.Items.Clear();
                PickTarget.Items.Add(new ComboBoxItem { Tag = null, Content = "— общая полка —" });
                foreach (var f in KindFolders())
                    PickTarget.Items.Add(new ComboBoxItem { Tag = (int)f["id"], Content = "🗀 " + (string)f["name"] });
                PickTarget.SelectedIndex = 0;
            }
            UpdatePickCount();
            RenderFolderChrome(); RenderShelves();
        }

        void PickOff_Click(object sender, RoutedEventArgs e)
        { _picking = false; _picked.Clear(); PickBar.Visibility = Visibility.Collapsed; RenderFolderChrome(); RenderShelves(); }

        void UpdatePickCount()
        {
            PickCount.Text = _picked.Count > 0
                ? "Выбрано: " + _picked.Count
                : "Отметьте вещи — их можно переложить разом";
        }

        async void MovePicked_Click(object sender, RoutedEventArgs e)
        {
            if (_picked.Count == 0) { Toast("Ничего не выбрано"); return; }
            var it = PickTarget.SelectedItem as ComboBoxItem;
            int? target = it != null ? (int?)it.Tag : null;
            var ids = new List<int>();
            var keys = new List<string>();
            foreach (var key in _picked)
            {
                var p = key.Split(':');
                if (p[0] == "book") { int num; int sid;
                    if (int.TryParse(p[1], out num) && _bookSiteId.TryGetValue(num, out sid))
                    { ids.Add(sid); keys.Add(key); } }
                else if (p[0] == "file") { int sid;
                    if (int.TryParse(p[1], out sid)) { ids.Add(sid); keys.Add(key); } }
                else { int sid; if (_pdfSiteId.TryGetValue(p[1], out sid))
                    { ids.Add(sid); keys.Add(key); } }
            }
            if (ids.Count == 0) { Toast("Этих вещей ещё нет на сайте — синхронизируйте книги"); return; }
            try
            {
                var r = await _site.PostJson("items_move",
                    new { type = LibKind(), ids = ids, folder = target });
                // раскладка правится на месте — без перечитывания с сервера
                foreach (var key in keys)
                {
                    var p = key.Split(':');
                    if (p[0] == "book") _bookFolder[int.Parse(p[1])] = target;
                    else if (p[0] == "pdf") _pdfFolder[p[1]] = target;
                    else if (_suiteFiles != null)
                        foreach (Newtonsoft.Json.Linq.JObject sf in _suiteFiles)
                            if ((int)sf["id"] == int.Parse(p[1]))
                                sf["folder_id"] = target == null
                                    ? null : (Newtonsoft.Json.Linq.JToken)target.Value;
                }
                Toast("Переложено: " + (int)r["moved"]);
                _picking = false; _picked.Clear(); PickBar.Visibility = Visibility.Collapsed;
                RenderFolderChrome(); RenderShelves();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        /* лежит ли вещь в открытой сейчас папке */
        bool InFolderBook(int num)
        {
            int? f; if (!_bookFolder.TryGetValue(num, out f)) f = null;
            return f == _curFolder;
        }
        bool InFolderPdf(string id)
        {
            int? f; if (!_pdfFolder.TryGetValue(id, out f)) f = null;
            return f == _curFolder;
        }

        /* уголок с галочкой поверх обложки в пору отбора */
        FrameworkElement PickWrap(FrameworkElement card, string key)
        {
            if (!_picking) return card;
            var g = new Grid();
            g.Children.Add(card);
            var mark = new Border
            {
                Width = 22, Height = 22, CornerRadius = new CornerRadius(6),
                HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(6, 6, 0, 0), Background = new SolidColorBrush(Color.FromArgb(180, 10, 8, 20)),
                BorderBrush = (Brush)FindResource("BorderBrush2"), BorderThickness = new Thickness(1),
                Child = new TextBlock
                {
                    Text = _picked.Contains(key) ? "✓" : "", FontSize = 13,
                    HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FD8B8"))
                }
            };
            g.Children.Add(mark);
            return g;
        }

        void PickItem(string key)
        {
            if (_picked.Contains(key)) _picked.Remove(key); else _picked.Add(key);
            UpdatePickCount();
            RenderShelves();
        }

        void OpenBook(int i)
        {
            if (_blSiteId >= 0) { var _ = LinkInterceptBook(i); return; }
            _readIndex = i;
            var b = (Newtonsoft.Json.Linq.JObject)_books[i];
            ReadTitle.Text = (string)b["title"];
            // как в моде: иероглифы шрифтом size, текст — size-12; здесь тот же коэффициент
            double sz = b["size"] != null ? (double)b["size"] : 34;
            double ratio = Math.Max(1.3, Math.Min(2.2, sz / Math.Max(10, sz - 12)));
            string body = StripSeals(PuaToUni(StripTags((string)b["text"])));
            ReadText.Inlines.Clear();
            foreach (System.Text.RegularExpressions.Match m in
                System.Text.RegularExpressions.Regex.Matches(body,
                    "(?:\uD80C[\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E])+|(?:(?!\uD80C)(?!\uD80D)[\\s\\S])+"))
            {
                bool hiero = m.Value.Length > 1 && m.Value[0] >= 0xD80C && m.Value[0] <= 0xD80D;
                var run = new System.Windows.Documents.Run(m.Value);
                if (hiero) run.FontSize = 16 * ratio;
                ReadText.Inlines.Add(run);
            }
            string trans = (string)b["translation"];
            bool has = !string.IsNullOrEmpty(trans);
            ReadTrans.Text = has ? trans : "";
            ReadTrans.Visibility = has ? Visibility.Visible : Visibility.Collapsed;
            ReadTransHead.Visibility = ReadTrans.Visibility;
            ReadStatus.Text = "";
            InterpretBtn.Content = has ? "☥ Истолковать заново" : "☥ Трактовать через ИИ";
            ReadOverlay.Visibility = Visibility.Visible;
            LoadHieroLinks((int)(b["num"] ?? 0));
        }

        // Трактовка идёт ЧЕРЕЗ САЙТ: ритуал оракула и скилл живут только на сервере,
        // ключ ИИ — из аккаунта (свой или выданный по иерархии).
        async void Interpret_Click(object sender, RoutedEventArgs e)
        {
            if (_readIndex < 0) return;
            if (_site == null || _siteRole == null)
            {
                Toast("Трактовка идёт через сайт — войдите в аккаунт (⛅ Сайт)");
                return;
            }
            var b = (Newtonsoft.Json.Linq.JObject)_books[_readIndex];
            var keyItem = KeyCombo.SelectedItem as ComboBoxItem;
            string keyClause = keyItem != null ? (keyItem.Tag as string ?? "") : "";
            InterpretBtn.IsEnabled = false;
            ReadStatus.Text = "Ищу книгу на сайте…";
            try
            {
                int sid = await SiteIdOfBookAsync((int)(b["num"] ?? 0));
                if (sid < 0)
                {
                    // книги ещё нет на сайте — тихо отправляем библиотеку и пробуем снова
                    await _site.Upload("books_import", "books", "books.json",
                        System.Text.Encoding.UTF8.GetBytes(_books.ToString()));
                    StripLocalSeals();
                    sid = await SiteIdOfBookAsync((int)(b["num"] ?? 0));
                }
                if (sid < 0) throw new Exception("книга не нашлась на сайте");
                ReadStatus.Text = "Оракул на сервере вглядывается в знаки…";
                var j = await _site.PostJson("book_interpret", new { id = sid, key_clause = keyClause });
                string result = (string)j["translation"];
                b["translation"] = result;
                System.IO.File.WriteAllText(_booksPath,
                    _books.ToString(Newtonsoft.Json.Formatting.Indented));
                ReadTrans.Text = result;
                ReadTrans.Visibility = Visibility.Visible;
                ReadTransHead.Visibility = Visibility.Visible;
                ReadStatus.Text = "Трактовка оракула сохранена в мод и на сайт";
                InterpretBtn.Content = "☥ Истолковать заново";
                RenderShelves();
            }
            catch (Exception ex) { ReadStatus.Text = ""; Toast("Трактовка: " + ex.Message); }
            InterpretBtn.IsEnabled = true;
        }

        /* --- PDF-библиотека (в игру и Писца не попадает) --- */
        bool _pdfMode;
        int _libMode;   // 0 — иероглифы, 1 — PDF, 2 — сюита
        List<PdfBook> _pdfs;
        PdfBook _curPdf;

        void TabHiero_Click(object sender, RoutedEventArgs e) { SetLibMode(0); }
        void TabPdf_Click(object sender, RoutedEventArgs e) { SetLibMode(1); }
        void TabSuite_Click(object sender, RoutedEventArgs e) { SetLibMode(2); }

        void SetLibMode(int mode)
        {
            _libMode = mode;
            _pdfMode = mode == 1;
            TabHiero.Style = (Style)FindResource(mode == 0 ? "Primary" : "Btn");
            TabPdf.Style = (Style)FindResource(mode == 1 ? "Primary" : "Btn");
            TabSuite.Style = (Style)FindResource(mode == 2 ? "Primary" : "Btn");
            NewItemBtn.Content = mode == 1 ? "➕ PDF" : "➕ Новая книга";
            NewItemBtn.Visibility = mode == 2 ? Visibility.Collapsed : Visibility.Visible;
            LibBrowseBtn.Visibility = mode == 0 ? Visibility.Visible : Visibility.Collapsed;
            if (mode == 1) EnsurePdfs();
            _curFolder = null; _picking = false; _picked.Clear();
            PickBar.Visibility = Visibility.Collapsed;
            UpdatePickCount();
            RenderFolderChrome();
            RenderShelves();
            if (mode == 2) { var _ = LoadSuiteShelf(); }
        }

        void RenderPdfShelves()
        {
            Shelves.Children.Clear();
            AddFolderCards();
            SetLibStatus("PDF: " + _pdfs.Count, Store.PdfDir);
            int shown = 0;
            foreach (var p in _pdfs)
            {
                var pb = p;
                if (!InFolderPdf(p.Id)) continue;
                shown++;
                var stack = new StackPanel { Margin = new Thickness(8, 12, 8, 0), Width = 108 };
                var cover = new Border
                {
                    Height = 138, CornerRadius = new CornerRadius(5, 11, 11, 5),
                    BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#C084FC")),
                    BorderThickness = new Thickness(2, 1, 1, 1), Cursor = Cursors.Hand,
                    Effect = new DropShadowEffect { BlurRadius = 12, ShadowDepth = 3, Opacity = .5 }
                };
                BitmapSource coverImg;
                if (_pdfCovers.TryGetValue(p.Id, out coverImg) && coverImg != null)
                {
                    // обложка — первая страница книги; заголовок поверх снизу на затемнении
                    cover.Background = new ImageBrush(coverImg)
                    { Stretch = Stretch.UniformToFill, AlignmentY = AlignmentY.Top };
                    var og = new Grid();
                    var strip = new LinearGradientBrush
                    { StartPoint = new Point(0, 0), EndPoint = new Point(0, 1) };
                    strip.GradientStops.Add(new GradientStop(Color.FromArgb(0, 10, 8, 20), 0));
                    strip.GradientStops.Add(new GradientStop(Color.FromArgb(220, 10, 8, 20), 1));
                    og.Children.Add(new Border
                    {
                        Height = 46, VerticalAlignment = VerticalAlignment.Bottom,
                        CornerRadius = new CornerRadius(0, 0, 10, 4), Background = strip
                    });
                    og.Children.Add(new TextBlock
                    {
                        Text = p.Title, TextWrapping = TextWrapping.Wrap, FontSize = 10.5, MaxHeight = 42,
                        TextAlignment = TextAlignment.Center, VerticalAlignment = VerticalAlignment.Bottom,
                        Margin = new Thickness(6, 0, 6, 6), Foreground = Brushes.White
                    });
                    cover.Child = og;
                }
                else
                {
                    // обложка ещё готовится — временный вид с корешком
                    var g = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
                    g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#4A2545"), 0));
                    g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#1A1338"), 1));
                    cover.Background = g;
                    var inner = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8) };
                    inner.Children.Add(new TextBlock { Text = "📕", FontSize = 22,
                        HorizontalAlignment = HorizontalAlignment.Center });
                    inner.Children.Add(new TextBlock
                    {
                        Text = p.Title, TextWrapping = TextWrapping.Wrap, FontSize = 11.5,
                        TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 6, 0, 0),
                        Foreground = (Brush)FindResource("TextBrush")
                    });
                    inner.Children.Add(new TextBlock { Text = "PDF", FontSize = 10,
                        TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 5, 0, 0),
                        Foreground = (Brush)FindResource("FaintBrush") });
                    cover.Child = inner;
                }
                string pkey = "pdf:" + pb.Id;
                cover.MouseLeftButtonUp += (s, ev) => { if (_picking) PickItem(pkey); else OpenPdf(pb); };
                stack.Children.Add(PickWrap(cover, pkey));
                stack.Children.Add(new Border
                {
                    Height = 6, Margin = new Thickness(-6, 0, -6, 0), CornerRadius = new CornerRadius(3),
                    Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2A1F5C"))
                });
                Shelves.Children.Add(stack);
            }
            if (shown == 0)
                Shelves.Children.Add(new TextBlock
                {
                    Text = _curFolder != null ? "В этой папке нет PDF."
                        : "Полка PDF пуста — добавьте файл кнопкой «➕ PDF» или получите книгу с сайта.",
                    Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(12, 24, 0, 0),
                    TextWrapping = TextWrapping.Wrap, MaxWidth = 500
                });
            var _ = LoadPdfCovers();   // недостающие обложки дорисуются в фоне и осядут на диске
        }
    }
}
