using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using DreamMap.Stalkers;

namespace DreamMap
{
    /* Проверка вёрстки: DreamMap.exe --layout-check <файл отчёта>
       Программа сама открывает каждое окно и панель в трёх размерах окна и записывает,
       какие кнопки и подписи обрезаны раскладкой или вылезли за край окна.
       Данные не меняет — только открывает и закрывает; в конце закрывается сама. */
    public partial class MainWindow
    {
        static string LayoutCheckTarget()
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length - 1; i++)
                if (a[i] == "--layout-check") return a[i + 1];
            return null;
        }

        class AuditView
        {
            public string Name;
            public Action Open;
            public Action Close;
            public Func<FrameworkElement> Root;
            public int Wait = 350;
        }

        async Task LayoutCheck(string report)
        {
            var sb = new StringBuilder();
            int total = 0;
            var sizes = new[]
            {
                new Size(MinWidth > 0 ? MinWidth : 1024, MinHeight > 0 ? MinHeight : 700),
                new Size(1366, 768),
                new Size(WorkAreaHere().Width, WorkAreaHere().Height)
            };
            foreach (var sz in sizes)
            {
                WindowState = WindowState.Normal;
                Left = 0; Top = 0; Width = sz.Width; Height = sz.Height;
                await Settle(500);
                string tag = (int)sz.Width + "×" + (int)sz.Height;
                foreach (var v in AuditViews())
                {
                    try
                    {
                        v.Open();
                        await Settle(v.Wait);
                        total += AuditTree(tag, v.Name, v.Root(), this, sb);
                    }
                    catch (Exception ex) { sb.AppendLine(tag + " · " + v.Name + " — не открылось: " + ex.Message); }
                    finally
                    {
                        try { v.Close(); } catch { }
                        await Settle(150);
                    }
                }
            }

            // окна гаданий — постоянного размера, их достаточно проверить один раз
            var makers = new Func<Window>[]
            {
                () => new MediciWindow(), () => new IChingWindow(), () => new ObiWindow(),
                () => new TonalpohualliWindow(), () => new TziteWindow()
            };
            foreach (var make in makers)
            {
                Window win = null;
                try
                {
                    win = make();
                    win.Owner = this;
                    win.Show();
                    await Settle(800);
                    total += AuditTree("своё окно", win.Title, (FrameworkElement)win.Content, win, sb);
                }
                catch (Exception ex) { sb.AppendLine("окно гадания — не открылось: " + ex.Message); }
                finally { if (win != null) win.Close(); }
            }

            sb.Insert(0, "Проверка вёрстки · " + DateTime.Now.ToString("dd.MM.yyyy HH:mm") +
                         " · находок: " + total + Environment.NewLine + Environment.NewLine);
            System.IO.File.WriteAllText(report, sb.ToString(), new UTF8Encoding(true));
            Application.Current.Shutdown();
        }

        async Task Settle(int ms)
        {
            await Task.Delay(ms);
            UpdateLayout();
            await Dispatcher.InvokeAsync(() => { }, System.Windows.Threading.DispatcherPriority.ApplicationIdle);
        }

        IEnumerable<AuditView> AuditViews()
        {
            Func<string, Action, Action, FrameworkElement, int, AuditView> v =
                (name, open, close, root, wait) => new AuditView { Name = name, Open = open, Close = close, Root = () => root, Wait = wait };
            Action closeLeft = () => LeftPanel.Visibility = Visibility.Collapsed;
            Action closeLib = () => { LibClose_Click(null, null); };
            bool online = _site != null && _siteRole != null;

            yield return new AuditView { Name = "главное окно", Open = () => { }, Close = () => { },
                                         Root = () => (FrameworkElement)Content };
            yield return v("новый сон", () => OpenNew_Click(null, null), closeLeft, LeftPanel, 350);
            yield return v("список снов", () => ToggleList_Click(null, null), closeLeft, LeftPanel, 350);
            if (Cur.Count > 0)
                yield return v("карточка сна", () => OpenDetails(Cur[0].Id),
                               () => RightPanel.Visibility = Visibility.Collapsed, RightPanel, 500);
            yield return v("настройки", () => OpenSettings_Click(null, null),
                           () => SettingsOverlay.Visibility = Visibility.Collapsed, SettingsOverlay, 350);
            yield return v("сайт", () => OpenSite_Click(null, null),
                           () => SiteOverlay.Visibility = Visibility.Collapsed, SiteOverlay, 350);
            yield return v("библиотека · иероглифы", () => { Library_Click(null, null); TabHiero_Click(null, null); }, closeLib, LibOverlay, 1500);
            yield return v("библиотека · PDF", () => { Library_Click(null, null); TabPdf_Click(null, null); },
                           closeLib, LibOverlay, 1800);
            yield return v("библиотека · сюита", () => { Library_Click(null, null); TabSuite_Click(null, null); },
                           closeLib, LibOverlay, 2500);
            if (_books != null && _books.Count > 0)
                yield return v("книга", () => { Library_Click(null, null); OpenBook(0); },
                               () => { ReadOverlay.Visibility = Visibility.Collapsed; closeLib(); }, ReadOverlay, 900);
            yield return v("новая книга", () => { Library_Click(null, null); NewBook_Click(null, null); },
                           () => { NewBookCancel_Click(null, null); closeLib(); }, NewBookOverlay, 600);
            if (_pdfs != null && _pdfs.Count > 0)
                yield return v("читалка PDF", () => OpenPdf(_pdfs[0]), () => PdfClose_Click(null, null), PdfOverlay, 2500);
            yield return v("правка текста", () => EditTextOverlay.Visibility = Visibility.Visible,
                           () => EditTextOverlay.Visibility = Visibility.Collapsed, EditTextOverlay, 300);
            yield return v("выбор картинки", () => ImgOverlay.Visibility = Visibility.Visible,
                           () => ImgOverlay.Visibility = Visibility.Collapsed, ImgOverlay, 300);
            yield return v("ход разбора сна", () => ProgOverlay.Visibility = Visibility.Visible,
                           () => ProgOverlay.Visibility = Visibility.Collapsed, ProgOverlay, 300);
            if (online && RankOf(_siteRole) >= 2)
                yield return v("пользователи", () => Users_Click(null, null),
                               () => UsersOverlay.Visibility = Visibility.Collapsed, UsersOverlay, 1500);
            if (online)
            {
                yield return v("дары", () => Gifts_Click(null, null),
                               () => GiftsOverlay.Visibility = Visibility.Collapsed, GiftsOverlay, 1300);
                yield return v("доверие", () => Trust_Click(null, null),
                               () => TrustOverlay.Visibility = Visibility.Collapsed, TrustOverlay, 1300);
            }
        }

        int AuditTree(string size, string view, FrameworkElement root, Window host, StringBuilder sb)
        {
            var hostRoot = (FrameworkElement)host.Content;
            double W = hostRoot.ActualWidth, H = hostRoot.ActualHeight;
            // карточка окна: у всплывающих окон — первая рамка внутри затемнения
            FrameworkElement card = root;
            var g = root as Panel;
            if (g != null && g.Children.Count > 0 && g.Children[0] is Border) card = (Border)g.Children[0];

            var seen = new HashSet<string>();
            int n = 0;
            foreach (var fe in Walk(root))
            {
                if (!fe.IsVisible || fe.ActualWidth < 1 || fe.ActualHeight < 1) continue;
                if (fe is ScrollContentPresenter || fe is ScrollViewer) continue;   // режут нарочно
                if (InScrollOrMap(fe, root)) continue;   // прокрутка и карта вправе уходить за край

                string what = null;
                bool control = fe is ButtonBase || fe is TextBlock || fe is TextBox || fe is ComboBox || fe is PasswordBox;
                if (!fe.ClipToBounds && LayoutInformation.GetLayoutClip(fe) != null)
                {
                    var tb = fe as TextBlock;
                    what = tb != null && tb.TextTrimming != TextTrimming.None
                        ? "сокращено троеточием" : "обрезано — не хватает места";
                }
                else if (control)
                {
                    Rect r;
                    try { r = fe.TransformToAncestor(hostRoot).TransformBounds(new Rect(fe.RenderSize)); }
                    catch { continue; }
                    if (r.Right > W + 1 || r.Bottom > H + 1 || r.Left < -1 || r.Top < -1) what = "за краем окна";
                    else if (card != root && Sticks(fe, card)) what = "вылезает за рамку окна";
                    else
                    {
                        // спрятано рамкой-предком, которая его режет
                        for (DependencyObject p = VisualTreeHelper.GetParent(fe); p != null && p != root; p = VisualTreeHelper.GetParent(p))
                        {
                            var a = p as FrameworkElement;
                            if (a == null || a.ActualWidth < 1) continue;
                            bool clips = a.ClipToBounds || LayoutInformation.GetLayoutClip(a) != null;
                            if (clips && Sticks(fe, a)) { what = "не видно целиком — режет " + a.GetType().Name; break; }
                        }
                    }
                }
                if (what == null) continue;

                string label = Describe(fe);
                if (label == null || !seen.Add(label + what)) continue;
                sb.AppendLine(size + " · " + view + " · " + label + " — " + what);
                n++;
            }
            return n;
        }

        static bool Sticks(FrameworkElement fe, FrameworkElement box)
        {
            Rect r;
            try { r = fe.TransformToAncestor(box).TransformBounds(new Rect(fe.RenderSize)); }
            catch { return false; }
            return r.Right > box.ActualWidth + 1.5 || r.Bottom > box.ActualHeight + 1.5 || r.Left < -1.5 || r.Top < -1.5;
        }

        static IEnumerable<FrameworkElement> Walk(DependencyObject d)
        {
            var fe = d as FrameworkElement;
            if (fe != null) yield return fe;
            int c = VisualTreeHelper.GetChildrenCount(d);
            for (int i = 0; i < c; i++)
                foreach (var x in Walk(VisualTreeHelper.GetChild(d, i))) yield return x;
        }

        bool InScrollOrMap(FrameworkElement fe, FrameworkElement root)
        {
            for (DependencyObject p = VisualTreeHelper.GetParent(fe); p != null && p != root; p = VisualTreeHelper.GetParent(p))
                if (p is ScrollContentPresenter || p == MapLayer || p == Map || p == Sky) return true;
            return fe == MapLayer || fe == Map || fe == Sky;
        }

        // что это за элемент — словами: текст кнопки или подписи; у панели — что в ней лежит
        static string Describe(FrameworkElement fe)
        {
            string t = null;
            var cc = fe as ContentControl;
            if (cc != null) t = cc.Content as string;
            var tb = fe as TextBlock;
            if (tb != null) t = tb.Text;
            if (fe is TextBox || fe is PasswordBox || fe is ComboBox) t = "поле " + fe.Name;
            if (string.IsNullOrWhiteSpace(t))
            {
                var inside = Walk(fe).Skip(1).Select(x => x is TextBlock ? ((TextBlock)x).Text
                                                         : x is ContentControl ? ((ContentControl)x).Content as string : null)
                                     .Where(s => !string.IsNullOrWhiteSpace(s)).Distinct().Take(5).ToList();
                if (inside.Count == 0) return null;   // пустая обёртка без текста — нечего сообщать
                t = fe.GetType().Name + (fe.Name != "" ? " " + fe.Name : "") + " [" + string.Join(" · ", inside) + "]";
            }
            t = t.Replace("\r", " ").Replace("\n", " ");
            if (t.Length > 110) t = t.Substring(0, 110) + "…";
            return (fe.Name != "" && !t.Contains(fe.Name) ? fe.Name + " " : "") + "«" + t + "»";
        }
    }
}
