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
        /* ===== обложки PDF: первая страница книги, один раз в фон и в зашифрованный кеш ===== */
        readonly Dictionary<string, BitmapSource> _pdfCovers = new Dictionary<string, BitmapSource>();
        bool _pdfCoversLoading;
        static string PdfCoverDir { get { return System.IO.Path.Combine(Store.Dir, "covers"); } }

        bool _pdfCoversDeferred;   // обложки отложены, пока читалка занимает движок

        async Task LoadPdfCovers()
        {
            if (_pdfs == null || _pdfCoversLoading) return;
            _pdfCoversLoading = true;
            _pdfCoversDeferred = false;
            bool any = false;
            try
            {
                System.IO.Directory.CreateDirectory(PdfCoverDir);
                foreach (var p in _pdfs.ToList())
                {
                    if (_pdfCovers.ContainsKey(p.Id)) continue;
                    string cache = System.IO.Path.Combine(PdfCoverDir, p.Id + ".enc");
                    byte[] png = null;
                    if (System.IO.File.Exists(cache))
                        try { png = Vault.DecryptFile(cache, Store.Dir); } catch { }
                    if (png == null)
                    {
                        // читалка открыта — не занимаем движок под обложки, дорисуем после
                        if (PdfOverlay.Visibility == Visibility.Visible) { _pdfCoversDeferred = true; break; }
                        byte[] plain;
                        try { plain = Store.ReadPdf(p); } catch { continue; }
                        png = await Task.Run(() => RenderPdfCoverPng(plain));
                        if (png != null)
                            try { Vault.EncryptToFile(png, cache, Store.Dir); } catch { }
                    }
                    if (png == null) continue;
                    try
                    {
                        var bi = new BitmapImage();
                        bi.BeginInit();
                        bi.CacheOption = BitmapCacheOption.OnLoad;
                        bi.StreamSource = new System.IO.MemoryStream(png);
                        bi.EndInit(); bi.Freeze();
                        _pdfCovers[p.Id] = bi;
                        any = true;
                    }
                    catch { }
                }
            }
            finally { _pdfCoversLoading = false; }
            if (any && _libMode == 1 && LibOverlay.Visibility == Visibility.Visible) RenderShelves();
            // после обложек — тихо «отснять» все страницы в кеш, чтобы открытие было мгновенным
            if (!_pdfCoversDeferred) { var _ = PrerenderPagesAsync(); }
        }

        /* ===== фоновая предвыработка страниц: снимаем каждый лист картинкой заранее,
           чтобы тяжёлый PDF не тормозил и при первом открытии. Пауза во время чтения. ===== */
        bool _prerendering;

        async Task PrerenderPagesAsync()
        {
            if (_pdfs == null || _prerendering) return;
            _prerendering = true;
            try
            {
                int renderW = (int)Math.Round(PdfBaseW * (_settings.PdfZoom > 0 ? _settings.PdfZoom : 1) * 1.15);
                if (renderW < 700) renderW = 700;
                if (renderW > 1400) renderW = 1400;
                System.IO.Directory.CreateDirectory(PdfPageCacheDir);
                foreach (var p in _pdfs.ToList())
                {
                    if (_libMode != 1) break;                       // ушли с полки PDF — остановимся
                    if (PdfOverlay.Visibility == Visibility.Visible) break; // читают — не мешаем
                    // первая страница уже под рукой (обложку сняли), проверим — есть ли кеш всех
                    string probe = System.IO.Path.Combine(PdfPageCacheDir, p.Id + "_0_" + renderW + ".enc");
                    if (System.IO.File.Exists(probe)) continue;     // этот PDF уже отснят при этой ширине
                    byte[] plain;
                    try { plain = Store.ReadPdf(p); } catch { continue; }
                    await Task.Run(() => PrerenderOne(plain, p.Id, renderW));
                }
            }
            catch { }
            finally { _prerendering = false; }
        }

        void PrerenderOne(byte[] plain, string pid, int renderW)
        {
            System.IO.MemoryStream mem = null;
            PdfiumViewer.PdfDocument doc = null;
            try
            {
                lock (_pdfiumLock)
                {
                    mem = new System.IO.MemoryStream(plain);
                    doc = PdfiumViewer.PdfDocument.Load(mem);
                }
                int pages = Math.Min(doc.PageCount, 500);
                for (int i = 0; i < pages; i++)
                {
                    // читалка важнее: если открыли книгу — бросаем предвыработку
                    if (PdfOverlay.Dispatcher.Invoke(() => PdfOverlay.Visibility == Visibility.Visible)) break;
                    string cache = System.IO.Path.Combine(PdfPageCacheDir, pid + "_" + i + "_" + renderW + ".enc");
                    if (System.IO.File.Exists(cache)) continue;
                    var s = doc.PageSizes[i];
                    int h = (int)(renderW * s.Height / s.Width);
                    byte[] png;
                    lock (_pdfiumLock)
                        using (var img = doc.Render(i, renderW, h, 96, 96, PdfiumViewer.PdfRenderFlags.Annotations))
                            png = BitmapToPng((System.Drawing.Bitmap)img);
                    try { Vault.EncryptToFile(png, cache, Store.Dir); } catch { }
                }
            }
            catch { }
            finally { lock (_pdfiumLock) { if (doc != null) doc.Dispose(); } if (mem != null) mem.Dispose(); }
        }

        // первая страница PDF → PNG (в фоне); открытые байты приходят расшифрованными
        static byte[] RenderPdfCoverPng(byte[] plain)
        {
            try
            {
                lock (_pdfiumLock)   // движок занят только нами
                using (var mem = new System.IO.MemoryStream(plain))
                using (var doc = PdfiumViewer.PdfDocument.Load(mem))
                {
                    if (doc.PageCount == 0) return null;
                    var s = doc.PageSizes[0];
                    int w = 240, h = (int)(w * s.Height / s.Width);
                    if (h < 1) h = 320;
                    using (var img = doc.Render(0, w, h, 96, 96, PdfiumViewer.PdfRenderFlags.None))
                    using (var ms = new System.IO.MemoryStream())
                    {
                        ((System.Drawing.Bitmap)img).Save(ms, System.Drawing.Imaging.ImageFormat.Png);
                        return ms.ToArray();
                    }
                }
            }
            catch { return null; }
        }

        bool _pdfsMigrated;
        // загрузить список PDF и один раз перевести старые открытые файлы под замок
        void EnsurePdfs()
        {
            if (_pdfs == null) _pdfs = Store.LoadPdfs();
            if (_pdfsMigrated) return;
            _pdfsMigrated = true;
            try
            {
                if (Store.EncryptLegacyPdfs(_pdfs) && LibOverlay.Visibility == Visibility.Visible)
                    RenderShelves();
            }
            catch { }
        }

        async void AddPdf_Click()
        {
            var dlg = new Microsoft.Win32.OpenFileDialog { Title = "Добавить PDF", Filter = "PDF (*.pdf)|*.pdf" };
            if (dlg.ShowDialog() != true) return;
            try
            {
                Store.EnsureDirs();
                string id = "p" + DateTime.Now.Ticks;
                string title = System.IO.Path.GetFileNameWithoutExtension(dlg.FileName);
                byte[] src = System.IO.File.ReadAllBytes(dlg.FileName);
                string file = Store.StashPdf(id, src);   // на диск ложится уже зашифрованным
                _pdfs.Add(new PdfBook { Id = id, Title = title, File = file });
                Store.SavePdfs(_pdfs);
                RenderShelves();
                // молча заливаем на сайт (если есть вход); дубли сервер отсекает по ext_id
                if (_site != null && _siteRole != null)
                {
                    try
                    {
                        await _site.Upload("pdf_add", "pdf", id + ".pdf", src, null,
                            new Dictionary<string, string> { { "title", title }, { "ext_id", id } },
                            "application/pdf");
                    }
                    catch (Exception ex) { Toast("PDF добавлен локально; на сайт не ушёл: " + ex.Message); }
                }
            }
            catch (Exception ex) { Toast("PDF: " + ex.Message); }
        }

        // зум читалки: страницы рендерятся с запасом чёткости, масштаб хранится в настройках
        const int PdfRenderW = 1500;
        const double PdfBaseW = 840;

        void ApplyPdfZoom()
        {
            PdfZoomText.Text = Math.Round(_settings.PdfZoom * 100) + "%";
            double w = PdfBaseW * _settings.PdfZoom;
            foreach (var ch in PdfPages.Children)
            {
                var im = ch as Image;
                if (im == null) continue;
                im.Width = w;
                // пустое место ещё не наполнено картинкой — держим его высоту по формату
                if (im.Source == null && im.Tag is double) im.Height = w * (double)im.Tag;
            }
        }
        void PdfZoomStep(int dir)
        {
            _settings.PdfZoom = Math.Max(0.5, Math.Min(3.0,
                _settings.PdfZoom * (dir > 0 ? 1.15 : 1 / 1.15)));
            Store.SaveSettings(_settings);
            ApplyPdfZoom();
        }
        void PdfZoomIn_Click(object sender, RoutedEventArgs e) { PdfZoomStep(1); }
        void PdfZoomOut_Click(object sender, RoutedEventArgs e) { PdfZoomStep(-1); }
        void PdfScroll_Wheel(object sender, MouseWheelEventArgs e)
        {
            if ((Keyboard.Modifiers & ModifierKeys.Control) == 0) return;
            PdfZoomStep(e.Delta > 0 ? 1 : -1);
            e.Handled = true;
        }

        // страницы читалки — чтобы знать, где остановился читатель
        Image[] _pdfImgArr = new Image[0];   // по одному пустому «месту» на страницу, наполняется фоном
        double[] _pdfAspect = new double[0]; // высота/ширина каждой страницы (для мест и зума)
        int _pdfCurPage;          // текущая верхняя страница (с 1)
        int _pdfGen;              // поколение открытия: старый фоновый рендер сам себя гасит
        // нативный Pdfium не потокобезопасен: все обращения к движку — строго по очереди
        static readonly object _pdfiumLock = new object();
        bool _pdfRestoring;       // идёт возврат на сохранённую страницу — не перезаписываем память

        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr o);

        // прямое превращение картинки Pdfium в кисть WPF — без кругооборота через PNG
        static BitmapSource ToBitmapSource(System.Drawing.Bitmap bmp)
        {
            IntPtr h = bmp.GetHbitmap();
            try
            {
                var src = System.Windows.Interop.Imaging.CreateBitmapSourceFromHBitmap(
                    h, IntPtr.Zero, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
                src.Freeze();
                return src;
            }
            finally { DeleteObject(h); }
        }

        int LastPageOf(PdfBook p)
        {
            int v;
            if (_settings.PdfPage != null && _settings.PdfPage.TryGetValue(p.Id, out v) && v > 0)
                return v;
            return p.LastPage > 0 ? p.LastPage : 1;   // серверное значение — запасное, для новой машины
        }

        void OpenPdf(PdfBook p)
        {
            if (_blSiteId >= 0) { var _ = LinkInterceptPdf(p); return; }
            _curPdf = p;
            int gen = ++_pdfGen;   // прежний фоновый рендер, увидев смену, остановится
            PdfTitle.Text = p.Title;
            PdfPages.Children.Clear();
            _pdfImgArr = new Image[0]; _pdfAspect = new double[0];
            _pdfCurPage = 0;
            PdfStatus.Text = "открываю…";
            PdfOverlay.Visibility = Visibility.Visible;
            ApplyPdfZoom();
            LoadPdfLinks(p);
            string path = Store.PdfPath(p);
            if (!System.IO.File.Exists(path)) { PdfStatus.Text = "файл потерян"; return; }
            byte[] plain;
            try { plain = Store.ReadPdf(p); }   // расшифровка только в память
            catch { PdfStatus.Text = "не удалось расшифровать (файл с другой машины?)"; return; }
            int startPage = LastPageOf(p);
            string pid = p.Id;
            // весь тяжёлый труд — в фоне; окно остаётся живым
            Task.Run(() => RenderPdfWorker(plain, gen, startPage, pid));
        }

        // отрисованные страницы кешируются на диск (зашифрованно): тяжёлый PDF
        // тормозит лишь при первом открытии, потом страницы берутся из кеша мгновенно
        static string PdfPageCacheDir { get { return System.IO.Path.Combine(Store.Dir, "pages"); } }

        static byte[] BitmapToPng(System.Drawing.Bitmap bmp)
        {
            using (var ms = new System.IO.MemoryStream())
            { bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png); return ms.ToArray(); }
        }

        static BitmapSource PngToFrozen(byte[] png)
        {
            var bi = new BitmapImage();
            bi.BeginInit();
            bi.CacheOption = BitmapCacheOption.OnLoad;
            bi.StreamSource = new System.IO.MemoryStream(png);
            bi.EndInit(); bi.Freeze();
            return bi;
        }

        async Task RenderPdfWorker(byte[] plain, int gen, int startPage, string pid)
        {
            System.IO.MemoryStream mem = null;
            PdfiumViewer.PdfDocument doc = null;
            try
            {
                mem = new System.IO.MemoryStream(plain);
                int count, pages;
                double[] aspect;
                lock (_pdfiumLock)   // загрузка и размеры — короткая критическая секция
                {
                    doc = PdfiumViewer.PdfDocument.Load(mem);
                    count = doc.PageCount;
                    pages = Math.Min(count, 500);
                    aspect = new double[pages];
                    for (int i = 0; i < pages; i++)
                    {
                        var s = doc.PageSizes[i];
                        aspect[i] = s.Height / s.Width;
                    }
                }
                // рендер под размер на экране (с небольшим запасом чёткости), а не
                // фиксированные 1500px: на экране резко, а тяжёлые векторные PDF —
                // в разы быстрее (у них время рендера линейно растёт с шириной)
                int renderW = (int)Math.Round(PdfBaseW * _settings.PdfZoom * 1.15);
                if (renderW < 700) renderW = 700;
                if (renderW > 1400) renderW = 1400;
                try { System.IO.Directory.CreateDirectory(PdfPageCacheDir); } catch { }
                // на UI: расставить пустые «места» нужного размера, сразу перелистнуть к странице
                await Dispatcher.InvokeAsync(() =>
                {
                    if (gen != _pdfGen) return;
                    PdfStatus.Text = "страниц: " + count;
                    _pdfAspect = aspect;
                    _pdfImgArr = new Image[pages];
                    double w = PdfBaseW * _settings.PdfZoom;
                    for (int i = 0; i < pages; i++)
                    {
                        var im = new Image
                        {
                            Width = w, Height = w * aspect[i], Tag = aspect[i],
                            Margin = new Thickness(0, 0, 0, 14),
                            Effect = new DropShadowEffect { BlurRadius = 20, ShadowDepth = 5, Opacity = .5 }
                        };
                        PdfPages.Children.Add(im);
                        _pdfImgArr[i] = im;
                    }
                    if (count > pages)
                        PdfPages.Children.Add(new TextBlock { Text = "…показаны первые 500 страниц",
                            Foreground = (Brush)FindResource("FaintBrush") });
                    if (startPage > 1 && startPage <= pages)
                    {
                        PdfPages.UpdateLayout();
                        _pdfRestoring = true;
                        _pdfImgArr[startPage - 1].BringIntoView();
                        Dispatcher.BeginInvoke(new Action(() => _pdfRestoring = false),
                            DispatcherPriority.Background);
                    }
                });
                // рисуем: сперва открытую страницу и дальше вперёд, потом то, что до неё
                foreach (int idx in PageOrder(startPage - 1, pages))
                {
                    if (gen != _pdfGen) break;
                    int h = (int)(renderW * aspect[idx]);
                    string cache = System.IO.Path.Combine(PdfPageCacheDir,
                        pid + "_" + idx + "_" + renderW + ".enc");
                    byte[] png = null;
                    if (System.IO.File.Exists(cache))                 // готовая страница из кеша
                        try { png = Vault.DecryptFile(cache, Store.Dir); } catch { png = null; }
                    if (png == null)                                  // впервые — рисуем движком
                    {
                        lock (_pdfiumLock)
                        {
                            if (gen != _pdfGen) break;
                            using (var img = doc.Render(idx, renderW, h, 96, 96,
                                PdfiumViewer.PdfRenderFlags.Annotations))
                                png = BitmapToPng((System.Drawing.Bitmap)img);
                        }
                        try { Vault.EncryptToFile(png, cache, Store.Dir); } catch { }
                    }
                    BitmapSource src;
                    try { src = PngToFrozen(png); } catch { continue; }
                    await Dispatcher.InvokeAsync(() =>
                    {
                        if (gen != _pdfGen) return;
                        var im = _pdfImgArr[idx];
                        im.Source = src;
                        im.Height = double.NaN;   // теперь высоту задаёт сама картинка
                    });
                }
            }
            catch (Exception ex)
            {
                await Dispatcher.InvokeAsync(() =>
                { if (gen == _pdfGen) { PdfStatus.Text = ""; Toast("PDF: " + ex.Message); } });
            }
            finally
            {
                lock (_pdfiumLock) { if (doc != null) doc.Dispose(); }
                if (mem != null) mem.Dispose();
            }
        }

        // порядок рисования: с открытой страницы вперёд до конца, затем от неё назад к началу
        static IEnumerable<int> PageOrder(int start, int count)
        {
            if (start < 0) start = 0;
            if (start >= count) start = count - 1;
            for (int i = start; i < count; i++) yield return i;
            for (int i = start - 1; i >= 0; i--) yield return i;
        }

        // при прокрутке — какая страница вверху окна; её и запоминаем
        void PdfScroll_Changed(object sender, ScrollChangedEventArgs e)
        {
            if (_curPdf == null || _pdfImgArr.Length == 0 || _pdfRestoring) return;
            if (Math.Abs(e.VerticalChange) < 0.5 && e.ExtentHeightChange == 0) return;
            double top = PdfScroll.VerticalOffset + PdfScroll.ViewportHeight * 0.35;
            int cur = 1; double acc = 0;
            for (int i = 0; i < _pdfImgArr.Length; i++)
            {
                acc += _pdfImgArr[i].ActualHeight + 14;
                if (acc <= top) cur = i + 2; else break;
            }
            if (cur > _pdfImgArr.Length) cur = _pdfImgArr.Length;
            if (cur == _pdfCurPage) return;
            _pdfCurPage = cur;
            SchedulePdfPageSave();
        }

        System.Windows.Threading.DispatcherTimer _pdfPageTimer;
        void SchedulePdfPageSave()
        {
            if (_pdfPageTimer == null)
            {
                _pdfPageTimer = new System.Windows.Threading.DispatcherTimer
                { Interval = TimeSpan.FromMilliseconds(900) };
                _pdfPageTimer.Tick += (s, e) => { _pdfPageTimer.Stop(); SavePdfPage(); };
            }
            _pdfPageTimer.Stop(); _pdfPageTimer.Start();
        }

        async void SavePdfPage()
        {
            if (_curPdf == null || _pdfCurPage < 1) return;
            var p = _curPdf; int page = _pdfCurPage;
            if (_settings.PdfPage == null) _settings.PdfPage = new Dictionary<string, int>();
            int old;
            if (_settings.PdfPage.TryGetValue(p.Id, out old) && old == page) { /* уже сохранено */ }
            else { _settings.PdfPage[p.Id] = page; p.LastPage = page; Store.SaveSettings(_settings); }
            if (_site != null && _siteRole != null)
                try { await _site.PostJson("pdf_page", new { ext_id = p.Id, page = page }); } catch { }
        }

        void PdfClose_Click(object sender, RoutedEventArgs e)
        {
            if (_pdfPageTimer != null) _pdfPageTimer.Stop();
            SavePdfPage();   // запомнить страницу, на которой закрыли
            _pdfGen++;       // остановить фоновый рендер
            PdfOverlay.Visibility = Visibility.Collapsed;
            PdfPages.Children.Clear();
            _pdfImgArr = new Image[0]; _pdfAspect = new double[0];
            _curPdf = null;
            // читалка освободила движок — дорисуем отложенные обложки
            if (_pdfCoversDeferred) { _pdfCoversDeferred = false; var _ = LoadPdfCovers(); }
        }

        void PdfDel_Click(object sender, RoutedEventArgs e)
        {
            if (_curPdf == null) return;
            if (MessageBox.Show("Удалить PDF «" + _curPdf.Title + "»?", "Библиотека",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            try { System.IO.File.Delete(System.IO.Path.Combine(Store.PdfDir, _curPdf.File)); } catch { }
            try { System.IO.File.Delete(System.IO.Path.Combine(PdfCoverDir, _curPdf.Id + ".enc")); } catch { }
            // выкинуть закешированные страницы этого PDF (всех разрешений)
            try
            {
                foreach (var f in System.IO.Directory.GetFiles(PdfPageCacheDir, _curPdf.Id + "_*.enc"))
                    System.IO.File.Delete(f);
            }
            catch { }
            _pdfCovers.Remove(_curPdf.Id);
            _pdfs.Remove(_curPdf);
            Store.SavePdfs(_pdfs);
            PdfClose_Click(null, null);
            RenderShelves();
        }

        void NewBook_Click(object sender, RoutedEventArgs e)
        {
            if (_pdfMode) { AddPdf_Click(); return; }
            if (_books == null) return;
            _editBookIndex = -1;
            NbHead.Text = "Новая книга";
            NbTitle.Text = ""; NbText.Text = "";
            NewBookOverlay.Visibility = Visibility.Visible;
        }
        void NewBookCancel_Click(object sender, RoutedEventArgs e)
        { _editBookIndex = -1; NewBookOverlay.Visibility = Visibility.Collapsed; }

        /* ===== кнопки читалки — как у книги на сайте: 🪐 🔗 ✏ 🎁 🗑 ===== */
        int _editBookIndex = -1;   // -1 — создание; иначе правка этой книги

        void SaveBooksFile()
        {
            System.IO.File.WriteAllText(_booksPath,
                _books.ToString(Newtonsoft.Json.Formatting.Indented));
        }

        // после операции с книгой полка тихо сверяется с сайтом
        async Task AutoSyncBooks()
        {
            if (_site == null || _siteRole == null) return;
            try { await SyncBooksAsync(quiet: true); } catch { }
        }

        void BookEdit_Click(object sender, RoutedEventArgs e)
        {
            if (_readIndex < 0) return;
            var b = (Newtonsoft.Json.Linq.JObject)_books[_readIndex];
            _editBookIndex = _readIndex;
            NbHead.Text = "Правка книги";
            NbTitle.Text = (string)b["title"];
            NbText.Text = (string)b["text"] ?? "";
            ReadOverlay.Visibility = Visibility.Collapsed;
            NewBookOverlay.Visibility = Visibility.Visible;
        }

        async void BookDel_Click(object sender, RoutedEventArgs e)
        {
            if (_readIndex < 0) return;
            var b = (Newtonsoft.Json.Linq.JObject)_books[_readIndex];
            if (MessageBox.Show("Удалить книгу «" + (string)b["title"] + "»?", "Библиотека",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            // сначала с сайта (там же умирают её связи), потом с местной полки
            if (_site != null && _siteRole != null)
            {
                try
                {
                    int sid = await SiteIdOfBookAsync((int)(b["num"] ?? 0));
                    if (sid >= 0) await _site.PostJson("book_del", new { id = sid });
                }
                catch (Exception ex) { Toast("С сайта не убралась: " + ex.Message); }
            }
            else Toast("Без входа книга удалена только локально — на сайте уберите после входа");
            _books.RemoveAt(_readIndex);
            _readIndex = -1;
            try { SaveBooksFile(); } catch (Exception ex) { Toast("books.json: " + ex.Message); }
            ReadOverlay.Visibility = Visibility.Collapsed;
            FillKeys();
            RenderShelves();
            Toast("Книга удалена");
            await AutoSyncBooks();
        }

        async void BookFoundation_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null) { Toast("Сначала войдите в аккаунт (⛅ Сайт)"); return; }
            if (_readIndex < 0) return;
            var b = (Newtonsoft.Json.Linq.JObject)_books[_readIndex];
            string mine = "";
            try
            {
                var names = new List<string>();
                foreach (var l in (Newtonsoft.Json.Linq.JArray)(await _site.Get("locations"))["locations"])
                    names.Add((string)l["loc"]);
                if (names.Count > 0) mine = " (ваши: " + string.Join(", ", names) + ")";
            }
            catch { }
            string cur = (string)b["location"] ?? "";
            string pick = AskWindow.Text(this, "Фундамент",
                "Локация-планета для фундамента" + mine + ":", cur);
            if (string.IsNullOrWhiteSpace(pick)) return;   // фундамент не снимается — лишь меняется
            try
            {
                int sid = await SiteIdOfBookAsync((int)(b["num"] ?? 0));
                if (sid < 0) { Toast("Книги ещё нет на сайте — нажмите «⇅ Синхронизировать книги»"); return; }
                await _site.PostJson("book_edit",
                    new { id = sid, title = (string)b["title"], location = pick.Trim() });
                b["location"] = pick.Trim();
                try { SaveBooksFile(); } catch { }
                ReadStatus.Text = "🪐 фундамент: " + pick.Trim();
                Toast("🪐 Книга легла фундаментом: " + pick.Trim());
                await AutoSyncBooks();
            }
            catch (Exception ex) { Toast("Фундамент: " + ex.Message); }
        }

        async void BookGive_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null) { Toast("Сначала войдите в аккаунт (⛅ Сайт)"); return; }
            if (_readIndex < 0) return;
            var b = (Newtonsoft.Json.Linq.JObject)_books[_readIndex];
            try
            {
                int sid = await SiteIdOfBookAsync((int)(b["num"] ?? 0));
                if (sid < 0) { Toast("Книги ещё нет на сайте — нажмите «⇅ Синхронизировать книги»"); return; }
                var users = (Newtonsoft.Json.Linq.JArray)(await _site.Get("gift_recipients"))["users"];
                if (users.Count == 0)
                { Toast("Дарить пока некому: предложите связь доверия (🤝)"); return; }
                int to; string msg;
                if (!GiveDialog((string)b["title"], users, out to, out msg)) return;
                var r = await _site.PostJson("book_give", new { id = sid, to = to, message = msg });
                Toast(r["auto"] != null && (bool)r["auto"]
                    ? "Дар принят сразу (автоприём): " + (string)r["to"]
                    : "Дар предложен — ждёт согласия: " + (string)r["to"]);
                await AutoSyncBooks();
            }
            catch (Exception ex) { Toast("Дар: " + ex.Message); }
        }

        // окно дара в духе программы: получатель + напутствие
        bool GiveDialog(string title, Newtonsoft.Json.Linq.JArray users, out int to, out string msg)
        {
            to = -1; msg = "";
            bool ok = false;
            var win = new Window
            {
                Owner = this, WindowStartupLocation = WindowStartupLocation.CenterOwner,
                WindowStyle = WindowStyle.None, ResizeMode = ResizeMode.NoResize,
                AllowsTransparency = true, Background = Brushes.Transparent,
                SizeToContent = SizeToContent.Height, Width = 420, ShowInTaskbar = false
            };
            var frame = new Border
            {
                CornerRadius = new CornerRadius(16), BorderThickness = new Thickness(1),
                BorderBrush = (Brush)FindResource("BorderBright"),
                Effect = new DropShadowEffect { BlurRadius = 30, ShadowDepth = 0, Opacity = .6 }
            };
            var bg = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
            bg.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#F81C1540"), 0));
            bg.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#FC0F0B24"), 1));
            frame.Background = bg;
            var st = new StackPanel { Margin = new Thickness(22, 18, 22, 18) };
            st.Children.Add(new TextBlock
            {
                Text = "🎁 Предложить в дар", FontFamily = new FontFamily("Segoe UI Emoji, Georgia"),
                FontSize = 18, Foreground = (Brush)FindResource("TextBrush")
            });
            st.Children.Add(new TextBlock
            {
                Text = "«" + title + "» — дар ляжет в ларец получателя.",
                FontSize = 12.5, Margin = new Thickness(0, 8, 0, 6), TextWrapping = TextWrapping.Wrap,
                Foreground = (Brush)FindResource("DimBrush")
            });
            var combo = new ComboBox { Style = (Style)FindResource("Combo") };
            foreach (Newtonsoft.Json.Linq.JObject us in users)
                combo.Items.Add(new ComboBoxItem
                { Tag = (int)us["id"], Content = (string)us["login"] + " · " + (string)us["how"] });
            combo.SelectedIndex = 0;
            st.Children.Add(combo);
            st.Children.Add(new TextBlock
            {
                Text = "НАПУТСТВИЕ (необязательно)", FontSize = 10.5,
                Margin = new Thickness(0, 10, 0, 4), Foreground = (Brush)FindResource("FaintBrush")
            });
            var msgBox = new TextBox { Style = (Style)FindResource("Input") };
            st.Children.Add(msgBox);
            var row = new StackPanel
            {
                Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 16, 0, 0)
            };
            var cancel = new Button
            { Style = (Style)FindResource("Ghost"), Content = "Отмена", Margin = new Thickness(0, 0, 8, 0) };
            var okBtn = new Button
            { Style = (Style)FindResource("Primary"), Content = "Подарить", MinWidth = 100, IsDefault = true };
            cancel.Click += (s, e2) => win.Close();
            okBtn.Click += (s, e2) => { ok = true; win.Close(); };
            row.Children.Add(cancel); row.Children.Add(okBtn);
            st.Children.Add(row);
            frame.Child = st;
            win.Content = frame;
            win.KeyDown += (s, e2) => { if (e2.Key == Key.Escape) win.Close(); };
            win.MouseLeftButtonDown += (s, e2) => { try { win.DragMove(); } catch { } };
            win.ShowDialog();
            if (!ok) return false;
            var it = combo.SelectedItem as ComboBoxItem;
            if (it == null) return false;
            to = (int)it.Tag;
            msg = msgBox.Text.Trim();
            return true;
        }

        async void NewBookSave_Click(object sender, RoutedEventArgs e)
        {
            string title = NbTitle.Text.Trim();
            if (title.Length == 0) { Toast("Нужно название книги"); return; }
            // правка существующей: локально + на сайт, затем тихая сверка
            if (_editBookIndex >= 0 && _editBookIndex < _books.Count)
            {
                var eb = (Newtonsoft.Json.Linq.JObject)_books[_editBookIndex];
                eb["title"] = title;
                eb["text"] = NbText.Text;
                try { SaveBooksFile(); } catch (Exception ex) { Toast("books.json: " + ex.Message); return; }
                NewBookOverlay.Visibility = Visibility.Collapsed;
                FillKeys();
                RenderShelves();
                if (_site != null && _siteRole != null)
                {
                    try
                    {
                        int esid = await SiteIdOfBookAsync((int)(eb["num"] ?? 0));
                        if (esid >= 0)
                            await _site.PostJson("book_edit",
                                new { id = esid, title = title, text = NbText.Text });
                    }
                    catch (Exception ex) { Toast("На сайт правка не доехала: " + ex.Message); }
                }
                _editBookIndex = -1;
                Toast("Книга обновлена");
                await AutoSyncBooks();
                return;
            }
            int num = 0;
            foreach (Newtonsoft.Json.Linq.JObject b in _books)
                num = Math.Max(num, (int)(b["num"] ?? 0));
            var nb = new Newtonsoft.Json.Linq.JObject
            {
                ["num"] = num + 1,
                ["title"] = title,
                ["text"] = NbText.Text,
                ["size"] = 34,
                ["per_page"] = 600,
                ["translation"] = ""
            };
            _books.Add(nb);
            try
            {
                System.IO.File.WriteAllText(_booksPath,
                    _books.ToString(Newtonsoft.Json.Formatting.Indented));
            }
            catch (Exception ex) { Toast("Не сохранилось: " + ex.Message); return; }
            NewBookOverlay.Visibility = Visibility.Collapsed;
            FillKeys();
            RenderShelves();

            // печать хранится только на сайте: доносим книгу и чистим локальный текст
            string sealStripped;
            string seal = ExtractLeadingSeal(NbText.Text, out sealStripped);
            if (seal != "")
            {
                if (_site != null && _siteRole != null)
                {
                    try
                    {
                        await _site.Upload("books_import", "books", "books.json",
                            System.Text.Encoding.UTF8.GetBytes(_books.ToString()));
                        StripLocalSeals();
                        RenderShelves();
                        Toast("Книга на полке; печать " + seal + " сохранена на сайте");
                        return;
                    }
                    catch (Exception ex) { Toast("Печать доедет позже: " + ex.Message); }
                }
                else Toast("Печать переедет на сайт при следующей синхронизации (войдите в ⛅ Сайт)");
                return;
            }
            Toast("Книга «" + title + "» на полке (в игру попадёт после пересборки в Писце)");
            await AutoSyncBooks();   // новая книга сразу тихо уезжает на сайт
        }
    }
}
