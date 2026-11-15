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
        /* ===== связи книг (данные — с сайта; права проверяет сервер по иерархии) ===== */
        string _blType; int _blSiteId = -1; string _blTitle;   // первая книга режима связывания

        async System.Threading.Tasks.Task<int> SiteIdOfBookAsync(int num)
        {
            var j = await _site.Get("books_list");
            foreach (Newtonsoft.Json.Linq.JObject sb in (Newtonsoft.Json.Linq.JArray)j["books"])
                if ((int)sb["num"] == num) return (int)sb["id"];
            return -1;
        }

        async System.Threading.Tasks.Task<int> SiteIdOfPdfAsync(PdfBook p)
        {
            if (p.Id.StartsWith("webp"))
            {
                int n;
                return int.TryParse(p.Id.Substring(4), out n) ? n : -1;
            }
            var j = await _site.Get("pdfs_list");
            foreach (Newtonsoft.Json.Linq.JObject sp in (Newtonsoft.Json.Linq.JArray)j["pdfs"])
                if ((string)sp["ext_id"] == p.Id) return (int)sp["id"];
            return -1;
        }

        async void BookLink_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null) { Toast("Сначала войдите в аккаунт (⛅ Сайт)"); return; }
            if (_readIndex < 0) return;
            var b = (Newtonsoft.Json.Linq.JObject)_books[_readIndex];
            int sid = await SiteIdOfBookAsync((int)(b["num"] ?? 0));
            if (sid < 0) { Toast("Книги ещё нет на сайте — нажмите «⇅ Синхронизировать книги»"); return; }
            _blType = "book"; _blSiteId = sid; _blTitle = (string)b["title"];
            ReadClose_Click(null, null);
            LibStatus.Text = "🔗 выберите вторую книгу (Esc — отмена)";
            Toast("Связываю «" + _blTitle + "» — кликните вторую книгу на любой полке");
        }

        async void PdfLink_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null) { Toast("Сначала войдите в аккаунт (⛅ Сайт)"); return; }
            if (_curPdf == null) return;
            int sid = await SiteIdOfPdfAsync(_curPdf);
            if (sid < 0) { Toast("PDF ещё нет на сайте — нажмите «⇅ Синхронизировать книги»"); return; }
            _blType = "pdf"; _blSiteId = sid; _blTitle = _curPdf.Title;
            PdfClose_Click(null, null);
            LibStatus.Text = "🔗 выберите вторую книгу (Esc — отмена)";
            Toast("Связываю «" + _blTitle + "» — кликните вторую книгу на любой полке");
        }

        void CancelBookLink()
        {
            if (_blSiteId < 0) return;
            _blType = null; _blSiteId = -1; _blTitle = null;
            RenderShelves();
        }

        async void FinishBookLink(string type, int siteId, string title)
        {
            if (type == _blType && siteId == _blSiteId) { Toast("Это та же книга"); return; }
            string reason = AskWindow.Text(this, "Связать книги",
                "«" + _blTitle + "»  ↔  «" + title + "» — почему связаны (можно оставить пустым):");
            if (reason == null) return;
            try
            {
                await _site.PostJson("book_link_add", new
                {
                    a_type = _blType, a_id = _blSiteId,
                    b_type = type, b_id = siteId, reason = reason
                });
                Toast("Связано: «" + _blTitle + "» ↔ «" + title + "»");
            }
            catch (Exception ex) { Toast(ex.Message); }
            CancelBookLink();
        }

        // клик по книге в режиме связывания вместо открытия завершает связь
        async System.Threading.Tasks.Task<bool> LinkInterceptBook(int i)
        {
            if (_blSiteId < 0) return false;
            var b = (Newtonsoft.Json.Linq.JObject)_books[i];
            int sid = await SiteIdOfBookAsync((int)(b["num"] ?? 0));
            if (sid < 0) { Toast("Этой книги нет на сайте — синхронизируйте"); return true; }
            FinishBookLink("book", sid, (string)b["title"]);
            return true;
        }

        async System.Threading.Tasks.Task<bool> LinkInterceptPdf(PdfBook p)
        {
            if (_blSiteId < 0) return false;
            int sid = await SiteIdOfPdfAsync(p);
            if (sid < 0) { Toast("Этого PDF нет на сайте — синхронизируйте"); return true; }
            FinishBookLink("pdf", sid, p.Title);
            return true;
        }

        async System.Threading.Tasks.Task ShowLinksAsync(string type, int siteId, StackPanel panel)
        {
            panel.Children.Clear();
            if (_site == null || _siteRole == null) return;
            try
            {
                var j = await _site.Get("book_links_list&type=" + type + "&id=" + siteId);
                var links = (Newtonsoft.Json.Linq.JArray)j["links"];
                if (links.Count == 0) return;
                panel.Children.Add(new TextBlock
                {
                    Text = "СВЯЗИ", FontSize = 10.5,
                    Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(0, 2, 0, 3)
                });
                foreach (Newtonsoft.Json.Linq.JObject l in links)
                {
                    var lo = l;
                    bool mine = (int)l["owner_id"] == _siteUid;
                    var row = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 1, 0, 1) };
                    var txt = new TextBlock
                    {
                        Text = ((string)l["type"] == "pdf" ? "📕 " : "𓏛 ") + (string)l["title"] +
                            (mine ? "" : "  · " + (string)l["owner"]) +
                            (string.IsNullOrEmpty((string)l["reason"]) ? "" : "  — " + (string)l["reason"]),
                        FontSize = 12.5, Cursor = Cursors.Hand, TextWrapping = TextWrapping.Wrap,
                        MaxWidth = 620,
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                            mine ? "#C9BEFC" : "#9A90C9"))
                    };
                    txt.MouseLeftButtonUp += (s, e) => TryOpenLinked(lo);
                    row.Children.Add(txt);
                    var del = new TextBlock
                    {
                        Text = " ✕", FontSize = 12.5, Cursor = Cursors.Hand,
                        ToolTip = "Развязать (нужен доступ к обеим книгам)",
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F87171"))
                    };
                    del.MouseLeftButtonUp += async (s, e) =>
                    {
                        try
                        {
                            await _site.PostJson("book_link_del", new { id = (int)lo["id"] });
                            await ShowLinksAsync(type, siteId, panel);
                        }
                        catch (Exception ex) { Toast(ex.Message); }
                    };
                    row.Children.Add(del);
                    panel.Children.Add(row);
                }
            }
            catch { }
        }

        async void TryOpenLinked(Newtonsoft.Json.Linq.JObject l)
        {
            if ((int)l["owner_id"] != _siteUid)
            {
                Toast("Том сновидца «" + l["owner"] + "» — открыть можно на сайте");
                return;
            }
            string type = (string)l["type"];
            int bid = (int)l["bid"];
            try
            {
                if (type == "book")
                {
                    var j = await _site.Get("books_list");
                    foreach (Newtonsoft.Json.Linq.JObject sb in (Newtonsoft.Json.Linq.JArray)j["books"])
                        if ((int)sb["id"] == bid)
                        {
                            int num = (int)sb["num"];
                            for (int i = 0; i < (_books != null ? _books.Count : 0); i++)
                                if ((int)(((Newtonsoft.Json.Linq.JObject)_books[i])["num"] ?? -1) == num)
                                {
                                    PdfClose_Click(null, null);
                                    OpenBook(i);
                                    return;
                                }
                        }
                }
                else
                {
                    EnsurePdfs();
                    var j = await _site.Get("pdfs_list");
                    foreach (Newtonsoft.Json.Linq.JObject sp in (Newtonsoft.Json.Linq.JArray)j["pdfs"])
                        if ((int)sp["id"] == bid)
                        {
                            string ext = (string)sp["ext_id"];
                            string localId = !string.IsNullOrEmpty(ext) ? ext : "webp" + bid;
                            var lp = _pdfs.FirstOrDefault(x => x.Id == localId);
                            if (lp != null)
                            {
                                ReadClose_Click(null, null);
                                OpenPdf(lp);
                                return;
                            }
                        }
                }
                Toast("Этой книги нет локально — нажмите «⇅ Синхронизировать книги» в окне «⛅ Сайт»");
            }
            catch (Exception ex) { Toast("Связь: " + ex.Message); }
        }

        async void LoadHieroLinks(int num)
        {
            ReadLinksPanel.Children.Clear();
            if (_site == null || _siteRole == null) return;
            try
            {
                var j = await _site.Get("books_list");
                foreach (Newtonsoft.Json.Linq.JObject sb in (Newtonsoft.Json.Linq.JArray)j["books"])
                    if ((int)sb["num"] == num)
                    {
                        // живой обмен трактовкой: кнопка на сайте видна в программе и наоборот
                        if (_readIndex >= 0 && (int)(((Newtonsoft.Json.Linq.JObject)_books[_readIndex])["num"] ?? -1) == num)
                        {
                            var lb = (Newtonsoft.Json.Linq.JObject)_books[_readIndex];
                            string siteTr = (string)sb["translation"] ?? "";
                            string localTr = (string)lb["translation"] ?? "";
                            if (siteTr != "" && siteTr != localTr)
                            {
                                lb["translation"] = siteTr;
                                System.IO.File.WriteAllText(_booksPath,
                                    _books.ToString(Newtonsoft.Json.Formatting.Indented));
                                ReadTrans.Text = siteTr;
                                ReadTrans.Visibility = Visibility.Visible;
                                ReadTransHead.Visibility = Visibility.Visible;
                                InterpretBtn.Content = "☥ Истолковать заново";
                                RenderShelves();
                            }
                            else if (siteTr == "" && localTr != "")
                            {
                                // локальная трактовка ещё не на сайте — тихо доносим
                                var _ = _site.Upload("books_import", "books", "books.json",
                                    System.Text.Encoding.UTF8.GetBytes(_books.ToString()));
                            }
                        }
                        await ShowLinksAsync("book", (int)sb["id"], ReadLinksPanel);
                        return;
                    }
            }
            catch { }
        }

        async void LoadPdfLinks(PdfBook p)
        {
            PdfLinksPanel.Children.Clear();
            if (_site == null || _siteRole == null) return;
            try
            {
                int siteId = -1;
                if (p.Id.StartsWith("webp")) int.TryParse(p.Id.Substring(4), out siteId);
                else
                {
                    var j = await _site.Get("pdfs_list");
                    foreach (Newtonsoft.Json.Linq.JObject sp in (Newtonsoft.Json.Linq.JArray)j["pdfs"])
                        if ((string)sp["ext_id"] == p.Id) { siteId = (int)sp["id"]; break; }
                }
                if (siteId > 0) await ShowLinksAsync("pdf", siteId, PdfLinksPanel);
            }
            catch { }
        }

        void LibClose_Click(object sender, RoutedEventArgs e) { LibOverlay.Visibility = Visibility.Collapsed; }
        void ReadClose_Click(object sender, RoutedEventArgs e) { ReadOverlay.Visibility = Visibility.Collapsed; }
    }
}
