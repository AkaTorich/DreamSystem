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
        /* ================= библиотека СкайМира ================= */
        // строка под шапкой: сколько вещей; где они лежат — в подсказке, чтобы путь не съедал шапку
        void SetLibStatus(string text, string where)
        {
            LibStatus.Text = text;
            LibStatus.ToolTip = string.IsNullOrEmpty(where) ? null : "Где лежит: " + where;
            if (_libMode == 0 && !string.IsNullOrEmpty(where))
                LibBrowseBtn.ToolTip = "Открыть другой books.json…" + Environment.NewLine + "Сейчас открыт: " + where;
        }

        Newtonsoft.Json.Linq.JArray _books;
        string _booksPath;
        int _readIndex = -1;

        static readonly string DefaultBooksPath = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            @"Mo2Organzer\mods\Египетские иероглифы\books.json");

        static string PuaToUni(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var sb = new System.Text.StringBuilder(s.Length);
            foreach (char c in s)
            {
                if (c >= 0xE000 && c <= 0xE42E)
                    sb.Append(char.ConvertFromUtf32(0x13000 + (c - 0xE000)));
                else sb.Append(c);
            }
            return sb.ToString();
        }
        static string StripTags(string s)
        {
            return System.Text.RegularExpressions.Regex.Replace(s ?? "", "<[^>]+>", "");
        }

        /* Печати скилла в читальне не показываются (в базе и books.json остаются —
           оракул на сервере их видит и исполняет). */
        static string CP(params int[] cps)
        {
            var sb = new System.Text.StringBuilder();
            foreach (int c in cps) sb.Append(char.ConvertFromUtf32(c));
            return sb.ToString();
        }
        static readonly string SigStart = CP(0x13000, 0x132BD);   // 𓀀𓊽 — блок перстня
        static readonly string SigEnd = CP(0x132BD, 0x13000);     // 𓊽𓀀
        static readonly string SealHall = CP(0x1305F, 0x13217, 0x131EF, 0x13068, 0x13190,
            0x131F0, 0x131F9, 0x13069, 0x13199);                  // зал Огдоады
        static readonly string[] Seals3 =
        {
            CP(0x132F9, 0x1305F, 0x13177),   // Великое Делание
            CP(0x132F9, 0x133DB, 0x13285),   // хроника Кереса
            CP(0x132F9, 0x131FC, 0x131EF)    // звёздное знамение
        };
        static readonly string[] Seals2 =
        {
            CP(0x1305F, 0x13050), CP(0x1305F, 0x13000), CP(0x1305F, 0x13177),
            CP(0x13050, 0x1305F), CP(0x13000, 0x1305F), CP(0x13177, 0x1305F),
            CP(0x13066, 0x13014), CP(0x132A8, 0x13014), CP(0x133DB, 0x13285)
        };
        static readonly string[] Seals1 =
        {
            CP(0x132F9), CP(0x13123), CP(0x133DE), CP(0x131F3), CP(0x13014),
            CP(0x132B9), CP(0x13146), CP(0x1315D), CP(0x1305F), CP(0x130FB),
            CP(0x1315E), CP(0x13177), CP(0x131A3), CP(0x13001), CP(0x13139),
            CP(0x131AB), CP(0x1335D), CP(0x13040), CP(0x1317D), CP(0x133E2)
        };

        static string PuaForm(string uniSeal)
        {
            var sb = new System.Text.StringBuilder();
            int i = 0;
            while (i < uniSeal.Length)
            {
                int cp = char.ConvertToUtf32(uniSeal, i);
                sb.Append((char)(0xE000 + (cp - 0x13000)));
                i += char.IsSurrogatePair(uniSeal, i) ? 2 : 1;
            }
            return sb.ToString();
        }

        // Печать с первой строки книги: возвращает её (в юникоде) и текст без печати.
        // Понимает обе записи — настоящий юникод и PUA-шрифт Писца.
        static string ExtractLeadingSeal(string text, out string stripped)
        {
            stripped = text ?? "";
            if (string.IsNullOrEmpty(text)) return "";
            var lines = text.Split('\n');
            string first = lines[0].TrimStart();
            var multi = new List<string> { SealHall };
            multi.AddRange(Seals3); multi.AddRange(Seals2);
            foreach (var s in multi)
                foreach (var form in new[] { s, PuaForm(s) })
                    if (first.StartsWith(form, StringComparison.Ordinal))
                    {
                        string rest = first.Substring(form.Length).TrimStart();
                        var lo = new List<string>(lines);
                        if (rest == "") lo.RemoveAt(0); else lo[0] = rest;
                        stripped = string.Join("\n", lo);
                        return s;
                    }
            foreach (var s in Seals1)
                foreach (var form in new[] { s, PuaForm(s) })
                    if (first.Trim() == form)
                    {
                        var lo = new List<string>(lines);
                        lo.RemoveAt(0);
                        stripped = string.Join("\n", lo);
                        return s;
                    }
            return "";
        }

        // после доставки печатей на сервер локальные тексты чистятся
        bool StripLocalSeals()
        {
            if (_books == null) return false;
            bool changed = false;
            foreach (Newtonsoft.Json.Linq.JObject lb in _books)
            {
                string st;
                if (ExtractLeadingSeal((string)lb["text"] ?? "", out st) != "")
                {
                    lb["text"] = st;
                    changed = true;
                }
            }
            if (changed)
                System.IO.File.WriteAllText(_booksPath,
                    _books.ToString(Newtonsoft.Json.Formatting.Indented));
            return changed;
        }

        static string StripSeals(string t)
        {
            if (string.IsNullOrEmpty(t)) return t;
            int i;
            while ((i = t.IndexOf(SigStart, StringComparison.Ordinal)) >= 0)
            {
                int j = t.IndexOf(SigEnd, i + SigStart.Length, StringComparison.Ordinal);
                if (j < 0) break;
                t = t.Remove(i, j + SigEnd.Length - i);
            }
            var lines = t.Split('\n');
            var outLines = new List<string>();
            for (int li = 0; li < lines.Length; li++)
            {
                string lt = lines[li].TrimStart();
                string cut = null;
                if (lt.StartsWith(SealHall, StringComparison.Ordinal)) cut = SealHall;
                if (cut == null) foreach (var s in Seals3)
                    if (lt.StartsWith(s, StringComparison.Ordinal)) { cut = s; break; }
                if (cut == null) foreach (var s in Seals2)
                    if (lt.StartsWith(s, StringComparison.Ordinal)) { cut = s; break; }
                if (cut != null) { outLines.Add(lt.Substring(cut.Length).TrimStart()); continue; }
                if (li == 0)
                {
                    bool solo = false;
                    foreach (var s in Seals1) if (lt.Trim() == s) { solo = true; break; }
                    if (solo) continue;   // первая строка — одинокая жанровая печать
                }
                outLines.Add(lines[li]);
            }
            return string.Join("\n", outLines);
        }

        void Library_Click(object sender, RoutedEventArgs e)
        {
            string path = !string.IsNullOrEmpty(_booksPath) ? _booksPath : DefaultBooksPath;
            if (!System.IO.File.Exists(path)) { LibBrowse_Click(null, null); return; }
            LoadLibrary(path);
        }

        void LibBrowse_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Title = "books.json из папки мода «Египетские иероглифы»",
                Filter = "Книги мода (books.json)|*.json"
            };
            if (dlg.ShowDialog() == true) LoadLibrary(dlg.FileName);
        }

        void LoadLibrary(string path)
        {
            try
            {
                var raw = System.IO.File.ReadAllText(path);
                _books = Newtonsoft.Json.Linq.JArray.Parse(raw);
                _booksPath = path;
            }
            catch (Exception ex) { Toast("Не удалось прочитать книги: " + ex.Message); return; }
            SetLibStatus("книг: " + _books.Count, path);
            FillKeys();
            // полка сразу рисуется по известной раскладке — вещи из папок остаются в папках
            _curFolder = null; _picking = false; _picked.Clear();
            PickBar.Visibility = Visibility.Collapsed;
            LoadFoldersCached();
            RenderFolderChrome();
            RenderShelves();
            LibOverlay.Visibility = Visibility.Visible;
            var _ = RefreshFolders();
        }

        // тихая сверка раскладки с сайтом: полка перерисовывается, только если что-то поменялось
        async Task RefreshFolders()
        {
            bool changed = await LoadFoldersQuiet();
            if (changed && LibOverlay.Visibility == Visibility.Visible)
            {
                // если за время сверки зашли в папку, которой больше нет, — назад на общую полку
                if (_curFolder != null && !KindFolders().Any(f => (int)f["id"] == _curFolder.Value))
                    _curFolder = null;
                RenderFolderChrome();
                RenderShelves();
            }
            var _ = LoadSuiteIcons();   // иконки сюиты подтягиваются заранее и оседают на диске
        }

        /* ===== полка сюиты «Гермес»: продукты с сайта, скачиваются по клику =====
           иконки один раз скачиваются и живут в профиле на диске */
        Newtonsoft.Json.Linq.JArray _suiteFiles;
        readonly Dictionary<int, byte[]> _suiteIcons = new Dictionary<int, byte[]>();
        bool _suiteIconsLoading;

        static string SuiteIconDir
        { get { return System.IO.Path.Combine(Store.Dir, "icons"); } }

        async Task LoadSuiteShelf()
        {
            if (_site == null || _siteRole == null) { RenderSuiteShelves(); return; }
            if (_suiteFiles == null)   // список уже известен — полка нарисована, второй раз не рисуем
            {
                try { _suiteFiles = (Newtonsoft.Json.Linq.JArray)(await _site.Get("files_list"))["files"]; }
                catch { _suiteFiles = null; }
                if (_libMode == 2) RenderSuiteShelves();
            }
            await LoadSuiteIcons();
        }

        async Task LoadSuiteIcons()
        {
            if (_suiteFiles == null || _suiteIconsLoading) return;
            _suiteIconsLoading = true;
            bool gotNew = false;
            try
            {
                System.IO.Directory.CreateDirectory(SuiteIconDir);
                foreach (Newtonsoft.Json.Linq.JObject f in _suiteFiles)
                {
                    int id = (int)f["id"];
                    if (_suiteIcons.ContainsKey(id) || string.IsNullOrEmpty((string)f["icon"]))
                        continue;
                    string cache = System.IO.Path.Combine(SuiteIconDir, "suite_" + id + ".bin");
                    if (System.IO.File.Exists(cache))
                    {
                        try { _suiteIcons[id] = System.IO.File.ReadAllBytes(cache); gotNew = true; continue; }
                        catch { }
                    }
                    if (_site == null || _siteRole == null) continue;
                    try
                    {
                        var bytes = await _site.Download("api.php?action=file_icon&id=" + id);
                        if (bytes != null && bytes.Length > 0)
                        {
                            _suiteIcons[id] = bytes;
                            try { System.IO.File.WriteAllBytes(cache, bytes); } catch { }
                            gotNew = true;
                        }
                    }
                    catch { }
                }
            }
            finally { _suiteIconsLoading = false; }
            if (gotNew && _libMode == 2) RenderSuiteShelves();
        }

        void RenderSuiteShelves()
        {
            Shelves.Children.Clear();
            AddFolderCards();
            if (_site == null || _siteRole == null)
            {
                LibStatus.Text = "";
                Shelves.Children.Add(new TextBlock
                {
                    Text = "Сюита «Гермес» живёт на сайте.\nВойдите в аккаунт (⛅ Сайт) — и полка с инструментами откроется здесь.",
                    Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(12, 24, 0, 0),
                    TextWrapping = TextWrapping.Wrap, MaxWidth = 520, LineHeight = 22
                });
                return;
            }
            if (_suiteFiles == null)
            {
                LibStatus.Text = "";
                Shelves.Children.Add(new TextBlock
                {
                    Text = "Полка сюиты загружается…",
                    Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(12, 24, 0, 0)
                });
                return;
            }
            SetLibStatus("инструментов: " + _suiteFiles.Count, null);
            int shown = 0;
            foreach (Newtonsoft.Json.Linq.JObject f in _suiteFiles)
            {
                if (!InFolderFile(f)) continue;
                shown++;
                int fid = (int)f["id"];
                string title = (string)f["title"];
                double mb = (long)(f["size"] ?? 0) / 1048576.0;
                var stack = new StackPanel { Margin = new Thickness(8, 12, 8, 0), Width = 108 };
                var cover = new Border
                {
                    Height = 138, CornerRadius = new CornerRadius(5, 11, 11, 5),
                    BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7DD3FC")),
                    BorderThickness = new Thickness(2, 1, 1, 1), Cursor = Cursors.Hand,
                    Effect = new DropShadowEffect { BlurRadius = 12, ShadowDepth = 3, Opacity = .5 },
                    ToolTip = string.IsNullOrEmpty((string)f["descr"]) ? null : (string)f["descr"]
                };
                var g = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#1E3A50"), 0));
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#1A1338"), 1));
                cover.Background = g;
                var inner = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8) };
                byte[] iconBytes;
                if (_suiteIcons.TryGetValue(fid, out iconBytes))
                {
                    try
                    {
                        var bi = new BitmapImage();
                        bi.BeginInit();
                        bi.StreamSource = new System.IO.MemoryStream(iconBytes);
                        bi.CacheOption = BitmapCacheOption.OnLoad;
                        bi.EndInit(); bi.Freeze();
                        inner.Children.Add(new Image
                        {
                            Source = bi, Width = 34, Height = 34,
                            HorizontalAlignment = HorizontalAlignment.Center
                        });
                    }
                    catch
                    {
                        inner.Children.Add(new TextBlock { Text = "⚙", FontSize = 24,
                            HorizontalAlignment = HorizontalAlignment.Center,
                            Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7DD3FC")) });
                    }
                }
                else
                    inner.Children.Add(new TextBlock { Text = "⚙", FontSize = 24,
                        HorizontalAlignment = HorizontalAlignment.Center,
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7DD3FC")) });
                inner.Children.Add(new TextBlock
                {
                    Text = title, TextWrapping = TextWrapping.Wrap, FontSize = 11.5,
                    TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 6, 0, 0),
                    Foreground = (Brush)FindResource("TextBrush")
                });
                inner.Children.Add(new TextBlock
                {
                    Text = mb.ToString("0.0") + " МБ", FontSize = 10,
                    TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 5, 0, 0),
                    Foreground = (Brush)FindResource("FaintBrush")
                });
                cover.Child = inner;
                string pkey = "file:" + fid;
                cover.MouseLeftButtonUp += (s, ev) =>
                { if (_picking) PickItem(pkey); else { var _ = DownloadSuiteFile(fid, title); } };
                stack.Children.Add(PickWrap(cover, pkey));
                stack.Children.Add(new Border
                {
                    Height = 6, Margin = new Thickness(-6, 0, -6, 0), CornerRadius = new CornerRadius(3),
                    Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2A1F5C"))
                });
                Shelves.Children.Add(stack);
            }
            if (shown == 0 && _suiteFiles.Count >= 0)
                Shelves.Children.Add(new TextBlock
                {
                    Text = _curFolder != null ? "В этой папке нет инструментов."
                        : "Полка сюиты пуста — инструменты приходят даром от владельца.",
                    Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(12, 20, 0, 0),
                    TextWrapping = TextWrapping.Wrap, MaxWidth = 500
                });
        }

        bool InFolderFile(Newtonsoft.Json.Linq.JObject f)
        {
            int? fid = f["folder_id"] == null || f["folder_id"].Type == Newtonsoft.Json.Linq.JTokenType.Null
                ? (int?)null : (int)f["folder_id"];
            return fid == _curFolder;
        }

        async Task DownloadSuiteFile(int id, string title)
        {
            // настоящее имя файла лежит в скобках названия: «Анкх (Ankh.exe)» → Ankh.exe
            string fname = title;
            var m = System.Text.RegularExpressions.Regex.Match(
                title, @"\(([^()]+\.[A-Za-z0-9]{1,5})\)\s*$");
            if (m.Success) fname = m.Groups[1].Value;
            string ext = System.IO.Path.GetExtension(fname).TrimStart('.').ToLowerInvariant();
            string filter = ext == "exe" ? "Приложение (*.exe)|*.exe|Все файлы (*.*)|*.*"
                : ext != "" ? ext.ToUpperInvariant() + " (*." + ext + ")|*." + ext + "|Все файлы (*.*)|*.*"
                : "Все файлы (*.*)|*.*";
            var dlg = new Microsoft.Win32.SaveFileDialog
            {
                Title = "Сохранить инструмент сюиты",
                FileName = fname,
                DefaultExt = ext,
                Filter = filter
            };
            if (dlg.ShowDialog() != true) return;
            try
            {
                Toast("«" + title + "» скачивается…");
                var bytes = await _site.Download("api.php?action=file_get&id=" + id);
                System.IO.File.WriteAllBytes(dlg.FileName, bytes);
                Toast("«" + title + "» сохранён: " + dlg.FileName);
            }
            catch (Exception ex) { Toast("Скачивание: " + ex.Message); }
        }

        // Ключи трактовки берутся из самой книги «Ключи к трактовке»:
        // строки «Название — пояснение», заголовки разделов оканчиваются двоеточием.
        void FillKeys()
        {
            KeyCombo.Items.Clear();
            var none = new ComboBoxItem { Tag = "", Content = "— без ключа (прямой перевод) —" };
            KeyCombo.Items.Add(none);
            KeyCombo.SelectedItem = none;

            Newtonsoft.Json.Linq.JObject keysBook = null;
            foreach (Newtonsoft.Json.Linq.JObject b in _books)
            {
                var t = ((string)b["title"] ?? "");
                if (t.IndexOf("Ключи к трактовке", StringComparison.OrdinalIgnoreCase) >= 0)
                { keysBook = b; break; }
            }
            if (keysBook == null) return;

            string body = PuaToUni(StripTags((string)keysBook["text"]));
            foreach (var rawLine in body.Split('\n'))
            {
                string line = rawLine.Trim();
                if (line.Length == 0) continue;
                if (line.EndsWith(":"))
                {
                    KeyCombo.Items.Add(new ComboBoxItem
                    {
                        Content = "— " + line.TrimEnd(':').Trim() + " —",
                        IsEnabled = false, FontSize = 11.5,
                        Foreground = (Brush)FindResource("FaintBrush")
                    });
                    continue;
                }
                int dash = line.IndexOf(" — ", StringComparison.Ordinal);
                if (dash <= 0) continue;
                string name = line.Substring(0, dash).Trim();
                KeyCombo.Items.Add(new ComboBoxItem { Content = name, Tag = line });
            }
        }

        void RenderShelves()
        {
            if (_libMode == 2) { RenderSuiteShelves(); return; }
            if (_libMode == 1) { RenderPdfShelves(); return; }
            Shelves.Children.Clear();
            AddFolderCards();
            SetLibStatus(_books == null ? "" : "книг: " + _books.Count, _booksPath);
            int shown = 0;
            for (int i = 0; i < _books.Count; i++)
            {
                var b = (Newtonsoft.Json.Linq.JObject)_books[i];
                int bnum = b["num"] != null ? (int)b["num"] : -1;
                if (!InFolderBook(bnum)) continue;
                shown++;
                bool hasTrans = !string.IsNullOrEmpty((string)b["translation"]);
                var stack = new StackPanel { Margin = new Thickness(8, 12, 8, 0), Width = 108 };
                var cover = new Border
                {
                    Height = 138, CornerRadius = new CornerRadius(5, 11, 11, 5),
                    BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8B7CF8")),
                    BorderThickness = new Thickness(2, 1, 1, 1), Cursor = Cursors.Hand,
                    Effect = new DropShadowEffect { BlurRadius = 12, ShadowDepth = 3, Opacity = .5 }
                };
                var g = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#332764"), 0));
                g.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#1A1338"), 1));
                cover.Background = g;
                var inner = new StackPanel { VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(8) };
                inner.Children.Add(new TextBlock
                {
                    Text = "𓏛", FontFamily = new FontFamily("Segoe UI Historic"), FontSize = 24,
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#CABEFC"))
                });
                inner.Children.Add(new TextBlock
                {
                    Text = (string)b["title"], TextWrapping = TextWrapping.Wrap, FontSize = 11.5,
                    TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 6, 0, 0),
                    Foreground = (Brush)FindResource("TextBrush")
                });
                inner.Children.Add(new TextBlock
                {
                    Text = hasTrans ? "☥ истолкована" : "том " + b["num"],
                    FontSize = 10, TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 5, 0, 0),
                    Foreground = hasTrans
                        ? new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FD8B8"))
                        : (Brush)FindResource("FaintBrush")
                });
                cover.Child = inner;
                int idx = i;
                string pkey = "book:" + bnum;
                cover.MouseLeftButtonUp += (s, ev) => { if (_picking) PickItem(pkey); else OpenBook(idx); };
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
                    Text = _curFolder == null ? "На общей полке пусто" : "В этой папке пока пусто",
                    Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(12, 20, 0, 0)
                });
        }

    }
}
