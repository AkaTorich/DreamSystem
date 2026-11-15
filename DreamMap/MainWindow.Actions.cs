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
        /* ================= действия ================= */
        async void SaveDream_Click(object sender, RoutedEventArgs e)
        {
            if (_viewDreams != null) { Toast("Новые сны пишутся на своей карте — «✦ Космос» вернёт назад"); return; }
            string text = FText.Text.Trim();
            if (text.Length == 0) { Toast("Опишите сон"); return; }
            var d = new Dream
            {
                Id = "d" + DateTime.Now.Ticks,
                Title = FTitle.Text.Trim().Length > 0 ? FTitle.Text.Trim() : "Сон без имени",
                Date = (FDate.SelectedDate ?? DateTime.Today).ToString("yyyy-MM-dd"),
                Text = text
            };
            var locItem = FLoc.SelectedItem as ComboBoxItem;
            string forcedLoc = locItem != null ? locItem.Tag as string : null;
            if (string.IsNullOrWhiteSpace(forcedLoc)) forcedLoc = null;
            // вписанная своими руками локация главнее списка — она работает и без сети
            string ownLoc = FLocNew.Text.Trim();
            if (ownLoc.Length > 0) forcedLoc = ShortLoc(ownLoc);
            _dreams.Add(d);
            Store.SaveDreams(_dreams);
            FTitle.Text = ""; FText.Text = ""; FLocNew.Text = "";
            LeftPanel.Visibility = Visibility.Collapsed;

            // без входа программа работает сама по себе: сон ложится на карту без ИИ
            if (_site == null || _siteRole == null)
            {
                if (forcedLoc != null)
                    d.Analysis = new Analysis { Location = ShortLoc(forcedLoc), Summary = "" };
                LinkByLocation(d);
                Store.SaveDreams(_dreams);
                RebuildGraph(); RenderList();
                OpenDetails(d.Id);
                Toast("Сон записан. Толкование и картина появятся после входа на сайт: «⛅ Сайт» → войти, затем ↻ в карточке сна");
                return;
            }
            SaveBtn.IsEnabled = false;
            try { await Pipeline(d, forcedLoc); } finally { SaveBtn.IsEnabled = true; }
            OpenDetails(d.Id);
        }

        /* правка записи сна: название и текст. Толкование не трогаем — его достраивает ↻ */
        string _editDreamId;

        void AddTextEditor(Dream d)
        {
            if (_viewDreams != null) return;   // чужую запись правят на сайте
            var btn = new Button
            {
                Style = (Style)FindResource("Ghost"), Content = "✎ править запись",
                HorizontalAlignment = HorizontalAlignment.Left, FontSize = 11.5,
                Margin = new Thickness(0, 0, 0, 6)
            };
            btn.Click += (s, e) =>
            {
                _editDreamId = d.Id;
                EditTextHead.Text = "Правка записи";
                EdTitle.Text = d.Title ?? "";
                EdText.Text = PuaToUni(d.Text ?? "");
                EditTextOverlay.Visibility = Visibility.Visible;
                EdText.Focus();
            };
            DetPanel.Children.Add(btn);
        }

        void EditTextCancel_Click(object sender, RoutedEventArgs e)
        { EditTextOverlay.Visibility = Visibility.Collapsed; _editDreamId = null; }

        async void EditTextSave_Click(object sender, RoutedEventArgs e)
        {
            var d = _dreams.FirstOrDefault(x => x.Id == _editDreamId);
            if (d == null) { EditTextCancel_Click(null, null); return; }
            string title = EdTitle.Text.Trim();
            string text = EdText.Text.Trim();
            if (text.Length == 0) { Toast("Запись не может быть пустой"); return; }
            d.Title = title.Length > 0 ? title : "Сон без имени";
            d.Text = text;
            Store.SaveDreams(_dreams);
            EditTextOverlay.Visibility = Visibility.Collapsed;
            RebuildGraph(); RenderList(); OpenDetails(d.Id);
            Toast("Запись сохранена");
            if (_site != null && _siteRole != null && _posMap.ContainsKey(d.Id))
                try
                {
                    await _site.PostJson("edit_dream", new
                    {
                        id = _posMap[d.Id], title = d.Title, text = d.Text,
                        location = d.Analysis != null ? d.Analysis.Location : ""
                    });
                }
                catch (Exception ex) { Toast("На сайт не ушло: " + ex.Message); }
            _editDreamId = null;
        }

        // сменить локацию сна прямо в карточке: сети перестраиваются и без сети
        void AddLocEditor(Dream d)
        {
            if (_viewDreams != null) return;   // чужую карту правят на сайте
            var btn = new Button
            {
                Style = (Style)FindResource("Ghost"), Content = "✎ сменить локацию",
                HorizontalAlignment = HorizontalAlignment.Left, FontSize = 11.5,
                Margin = new Thickness(0, 4, 0, 0)
            };
            btn.Click += (s, e) =>
            {
                string cur = d.Analysis != null ? d.Analysis.Location : "";
                string val = AskWindow.Text(this, "Локация",
                    "Локация сна «" + d.Title + "»: сны одной локации становятся спутниками одной планеты.",
                    cur ?? "");
                if (val == null) return;
                val = val.Trim();
                if (val == (cur ?? "").Trim()) return;
                if (d.Analysis == null) d.Analysis = new Analysis();
                d.Analysis.Location = ShortLoc(val);
                if (d.Links != null) d.Links.RemoveAll(l => l.Type == "локация");
                foreach (var o in _dreams)
                    if (o.Links != null) o.Links.RemoveAll(l => l.Id == d.Id && l.Type == "локация");
                LinkByLocation(d);
                Store.SaveDreams(_dreams);
                RebuildGraph(); RenderList(); OpenDetails(d.Id);
                Toast(val.Length > 0 ? "Локация: " + val : "Локация снята");
                if (_site != null && _siteRole != null && _posMap.ContainsKey(d.Id))
                    PushLocation(d);
            };
            DetPanel.Children.Add(btn);
        }

        async void PushLocation(Dream d)
        {
            try
            {
                await _site.PostJson("edit_dream", new
                {
                    id = _posMap[d.Id], title = d.Title, text = d.Text,
                    location = d.Analysis != null ? d.Analysis.Location : ""
                });
            }
            catch { }
        }

        // имя локации — подпись под планетой: не более трёх слов
        static string ShortLoc(string s)
        {
            s = (s ?? "").Trim();
            if (s.Length == 0) return "";
            s = System.Text.RegularExpressions.Regex.Replace(s, @"\s+", " ");
            int comma = s.IndexOf(',');
            if (comma > 0) s = s.Substring(0, comma);
            var w = s.Split(' ');
            if (w.Length > 3) s = string.Join(" ", w.Take(3));
            return s.Trim(' ', '-', '—', ':', ';', '.');
        }

        // без ИИ сны сцепляются по общей локации — этого довольно, чтобы карта жила
        void LinkByLocation(Dream d)
        {
            string loc = d.Analysis != null ? (d.Analysis.Location ?? "").Trim() : "";
            if (loc.Length == 0) return;
            if (d.Links == null) d.Links = new List<Link>();
            foreach (var o in _dreams)
            {
                if (o.Id == d.Id || o.Analysis == null) continue;
                if (!string.Equals((o.Analysis.Location ?? "").Trim(), loc, StringComparison.OrdinalIgnoreCase)) continue;
                bool already = d.Links.Any(l => l.Id == o.Id && l.Type == "локация") ||
                    (o.Links != null && o.Links.Any(l => l.Id == d.Id && l.Type == "локация"));
                if (!already)
                    d.Links.Add(new Link { Id = o.Id, Type = "локация", Reason = "та же локация — " + loc });
            }
        }

        async void Redo_Click(object sender, RoutedEventArgs e)
        {
            if (_viewDreams != null) { Toast("Достройка через ИИ — только на своей карте; правки чужих снов — на сайте"); return; }
            if (_site == null || _siteRole == null)
            { Toast("Достройка идёт через сайт — войдите в аккаунт (⛅ Сайт)"); return; }
            var d = _dreams.FirstOrDefault(x => x.Id == _currentId);
            if (d == null) return;
            RightPanel.Visibility = Visibility.Collapsed;
            await Pipeline(d);
            OpenDetails(d.Id);
        }

        async void Delete_Click(object sender, RoutedEventArgs e)
        {
            if (_viewDreams != null)   // на чужой карте — удаление через сайт (иерархию проверит сервер)
            {
                var vd = _viewDreams.FirstOrDefault(x => x.Id == _currentId);
                if (vd == null || _viewUid <= 0 || !_viewPosMap.ContainsKey(vd.Id)) return;
                if (MessageBox.Show("Удалить сон «" + vd.Title + "» сновидца «" + _viewDreamer + "»?",
                    "Карта снов", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
                try
                {
                    await _site.PostJson("del_dream", new { id = _viewPosMap[vd.Id] });
                    _viewDreams.Remove(vd);
                    foreach (var x in _viewDreams)
                        if (x.Links != null) x.Links.RemoveAll(l => l.Id == vd.Id);
                    RightPanel.Visibility = Visibility.Collapsed; _currentId = null;
                    RebuildGraph(); RenderList();
                    Toast("Сон удалён с карты сновидца «" + _viewDreamer + "»");
                }
                catch (Exception ex) { Toast(ex.Message); }
                return;
            }
            var d = _dreams.FirstOrDefault(x => x.Id == _currentId);
            if (d == null) return;
            if (MessageBox.Show("Удалить сон «" + d.Title + "»?", "Карта снов",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            _dreams.Remove(d);
            foreach (var x in _dreams)
                if (x.Links != null) x.Links.RemoveAll(l => l.Id == d.Id);
            bool imageShared = !string.IsNullOrEmpty(d.ImageFile) && _dreams.Any(x => x.ImageFile == d.ImageFile);
            if (!imageShared)
                try { string p = Store.ImagePath(d); if (p != null) System.IO.File.Delete(p); } catch { }
            Store.SaveDreams(_dreams);
            RightPanel.Visibility = Visibility.Collapsed; _currentId = null;
            RebuildGraph(); RenderList();

            // сон живёт и на сайте: удаляем и там, иначе синхронизация вернёт его обратно.
            // Надгробие ставится до попытки — если сайт недоступен, удаление доедет позже.
            _graves.Add(d.Id);
            Store.SaveGraves(_graves);
            if (_site != null && _siteRole != null && _posMap.ContainsKey(d.Id))
            {
                try
                {
                    await _site.PostJson("del_dream", new { id = _posMap[d.Id] });
                    _posMap.Remove(d.Id);
                }
                catch (Exception ex) { Toast("Сон удалён здесь; на сайте — при следующей связи (" + ex.Message + ")"); }
            }
        }

        /* ================= панели ================= */
        void OpenNew_Click(object sender, RoutedEventArgs e)
        {
            LeftTitle.Text = "Новый сон";
            FormPanel.Visibility = Visibility.Visible;
            ListPanel.Visibility = Visibility.Collapsed;
            if (FDate.SelectedDate == null) FDate.SelectedDate = DateTime.Today;

            FLocNew.Text = "";
            FLoc.Items.Clear();
            bool online = _site != null && _siteRole != null;
            var auto = new ComboBoxItem { Tag = "",
                Content = online ? "✨ Определить из текста сна" : "— без локации (ИИ недоступен без входа)" };
            FLoc.Items.Add(auto);
            FLoc.SelectedItem = auto;
            var groups = _dreams.Where(x => x.Analysis != null && !string.IsNullOrWhiteSpace(x.Analysis.Location))
                .GroupBy(x => x.Analysis.Location.Trim(), StringComparer.OrdinalIgnoreCase);
            foreach (var g in groups.OrderByDescending(g => g.Count()))
            {
                string label = g.First().Analysis.Location.Trim();
                int n = g.Count();
                FLoc.Items.Add(new ComboBoxItem { Tag = label,
                    Content = label + "   ·  снов: " + n });
            }

            LeftPanel.Visibility = Visibility.Visible;
        }

        void ToggleList_Click(object sender, RoutedEventArgs e)
        {
            if (LeftPanel.Visibility == Visibility.Visible && ListPanel.Visibility == Visibility.Visible)
            { LeftPanel.Visibility = Visibility.Collapsed; return; }
            FormPanel.Visibility = Visibility.Collapsed;
            ListPanel.Visibility = Visibility.Visible;
            RenderList();
            LeftPanel.Visibility = Visibility.Visible;
        }

        void CloseLeft_Click(object sender, RoutedEventArgs e) { LeftPanel.Visibility = Visibility.Collapsed; }
        void CloseRight_Click(object sender, RoutedEventArgs e) { RightPanel.Visibility = Visibility.Collapsed; _currentId = null; }

        void RenderList()
        {
            if (ListPanel.Visibility != Visibility.Visible) return;
            LeftTitle.Text = (_viewDreams != null ? "Сновидец " + _viewDreamer + " · " : "Сны · ") + Cur.Count;
            ListPanel.Children.Clear();
            foreach (var d in Enumerable.Reverse(Cur))
            {
                var card = new Border
                {
                    CornerRadius = new CornerRadius(12), Padding = new Thickness(10),
                    Margin = new Thickness(0, 0, 0, 8), Cursor = Cursors.Hand,
                    Background = new SolidColorBrush(Color.FromArgb(8, 255, 255, 255))
                };
                var g = new Grid();
                g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                g.ColumnDefinitions.Add(new ColumnDefinition());

                FrameworkElement thumb;
                string img = Store.ImagePath(d);
                if (img != null)
                {
                    var bi = new BitmapImage();
                    bi.BeginInit(); bi.CacheOption = BitmapCacheOption.OnLoad;
                    bi.DecodePixelWidth = 120; bi.UriSource = new Uri(img); bi.EndInit(); bi.Freeze();
                    thumb = new Border
                    {
                        Width = 56, Height = 56, CornerRadius = new CornerRadius(10),
                        Background = new ImageBrush(bi) { Stretch = Stretch.UniformToFill }
                    };
                }
                else
                {
                    thumb = new Border
                    {
                        Width = 56, Height = 56, CornerRadius = new CornerRadius(10), Background = DarkNodeFill(),
                        Child = new TextBlock { Text = "☾", FontSize = 20, Foreground = (Brush)FindResource("DimBrush"),
                            HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center }
                    };
                }
                thumb.Margin = new Thickness(0, 0, 12, 0);
                Grid.SetColumn(thumb, 0);
                g.Children.Add(thumb);

                var sp = new StackPanel();
                sp.Children.Add(new TextBlock { Text = d.Title, FontWeight = FontWeights.Bold, FontSize = 14,
                    Foreground = (Brush)FindResource("TextBrush") });
                sp.Children.Add(new TextBlock { Text = d.Date, FontSize = 11,
                    Foreground = (Brush)FindResource("FaintBrush") });
                string sum = d.Analysis != null ? d.Analysis.Summary : d.Text;
                if (sum.Length > 110) sum = sum.Substring(0, 110) + "…";
                sp.Children.Add(new TextBlock { Text = sum, FontSize = 12, TextWrapping = TextWrapping.Wrap,
                    FontFamily = new FontFamily("Segoe UI, Segoe UI Historic"),
                    Foreground = (Brush)FindResource("DimBrush"), Margin = new Thickness(0, 3, 0, 0) });
                Grid.SetColumn(sp, 1);
                g.Children.Add(sp);

                card.Child = g;
                string id = d.Id;
                card.MouseLeftButtonUp += (s, ev) => OpenDetails(id);
                card.MouseEnter += (s, ev) => card.Background = new SolidColorBrush(Color.FromArgb(22, 147, 112, 255));
                card.MouseLeave += (s, ev) => card.Background = new SolidColorBrush(Color.FromArgb(8, 255, 255, 255));
                ListPanel.Children.Add(card);
            }
            if (Cur.Count == 0)
                ListPanel.Children.Add(new TextBlock { Text = "Пока пусто.", Foreground = (Brush)FindResource("FaintBrush"),
                    Margin = new Thickness(0, 20, 0, 0) });
        }

        /* ================= детали ================= */
        void OpenDetails(string id)
        {
            var d = Cur.FirstOrDefault(x => x.Id == id);
            if (d == null) return;
            _currentId = id;
            DetPanel.Children.Clear();

            string img = Store.ImagePath(d);
            if (img != null)
            {
                var bi = new BitmapImage();
                bi.BeginInit(); bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.DecodePixelWidth = 800; bi.UriSource = new Uri(img); bi.EndInit(); bi.Freeze();
                DetPanel.Children.Add(new Border
                {
                    CornerRadius = new CornerRadius(14), Height = 240,
                    Background = new ImageBrush(bi) { Stretch = Stretch.UniformToFill },
                    Effect = new DropShadowEffect { BlurRadius = 30, ShadowDepth = 6, Opacity = 0.5 }
                });
            }
            DetPanel.Children.Add(new TextBlock { Text = d.Title, FontFamily = new FontFamily("Georgia"),
                FontSize = 25, Foreground = (Brush)FindResource("TextBrush"), TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 12, 0, 0) });
            DetPanel.Children.Add(new TextBlock { Text = d.Date, FontSize = 12,
                Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(0, 2, 0, 8) });

            var a = d.Analysis;
            if (a != null)
            {
                var sumBorder = new Border
                {
                    BorderThickness = new Thickness(2, 0, 0, 0),
                    BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#A78BFA")),
                    Padding = new Thickness(12, 2, 0, 2), Margin = new Thickness(0, 6, 0, 6)
                };
                sumBorder.Child = new TextBlock { Text = a.Summary, FontStyle = FontStyles.Italic, FontSize = 14,
                    TextWrapping = TextWrapping.Wrap, LineHeight = 21,
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#C4BBEA")) };
                DetPanel.Children.Add(sumBorder);

                AddSect("ЛОКАЦИЯ");
                AddChips(new List<string> { a.Location }, "#A5E3FC", "#1F7DD3FC");
                AddLocEditor(d);
                if (a.Characters.Count > 0) { AddSect("ПЕРСОНАЖИ"); AddChips(a.Characters, "#C9BEFC", "#1A9370FF"); }
                if (a.Emotions.Count > 0) { AddSect("ЭМОЦИИ"); AddChips(a.Emotions, "#C9BEFC", "#1A9370FF"); }
                if (a.Symbols.Count > 0) { AddSect("СИМВОЛЫ"); AddChips(a.Symbols, "#C9BEFC", "#1A9370FF"); }
                if (a.Motifs.Count > 0) { AddSect("МОТИВЫ"); AddChips(a.Motifs, "#C9BEFC", "#1A9370FF"); }
            }
            else
            {   // сон записан без ИИ — локацию можно назвать руками
                AddSect("ЛОКАЦИЯ");
                DetPanel.Children.Add(new TextBlock
                {
                    Text = "не названа", FontSize = 12.5, Foreground = (Brush)FindResource("FaintBrush")
                });
                AddLocEditor(d);
            }

            var related = new List<Tuple<Dream, Link>>();
            foreach (var l in d.Links ?? new List<Link>())
            {
                var o = Cur.FirstOrDefault(x => x.Id == l.Id);
                if (o != null) related.Add(Tuple.Create(o, l));
            }
            foreach (var o in Cur)
                if (o.Id != d.Id && o.Links != null)
                {
                    var l = o.Links.FirstOrDefault(x => x.Id == d.Id);
                    if (l != null) related.Add(Tuple.Create(o, l));
                }
            if (related.Count > 0)
            {
                AddSect("НИТИ К ДРУГИМ СНАМ");
                foreach (var t in related)
                {
                    var row = new Border { CornerRadius = new CornerRadius(9), Padding = new Thickness(9, 7, 9, 7),
                        Cursor = Cursors.Hand, Background = Brushes.Transparent };
                    var sp = new StackPanel { Orientation = Orientation.Horizontal };
                    Color c = LinkColors.ContainsKey(t.Item2.Type) ? LinkColors[t.Item2.Type] : Colors.Gray;
                    sp.Children.Add(new Border
                    {
                        CornerRadius = new CornerRadius(99), Padding = new Thickness(9, 2, 9, 3),
                        Background = new SolidColorBrush(Color.FromArgb(40, c.R, c.G, c.B)),
                        Margin = new Thickness(0, 0, 8, 0), VerticalAlignment = VerticalAlignment.Center,
                        Child = new TextBlock { Text = t.Item2.Type, FontSize = 11, Foreground = new SolidColorBrush(c) }
                    });
                    var txt = new TextBlock { TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, MaxWidth = 270 };
                    txt.Inlines.Add(new System.Windows.Documents.Run(t.Item1.Title)
                        { Foreground = (Brush)FindResource("TextBrush"), FontSize = 13 });
                    if (!string.IsNullOrEmpty(t.Item2.Reason))
                        txt.Inlines.Add(new System.Windows.Documents.Run("  — " + t.Item2.Reason)
                            { Foreground = (Brush)FindResource("FaintBrush"), FontSize = 12 });
                    sp.Children.Add(txt);
                    row.Child = sp;
                    string oid = t.Item1.Id;
                    row.MouseLeftButtonUp += (s, ev) => OpenDetails(oid);
                    row.MouseEnter += (s, ev) => row.Background = new SolidColorBrush(Color.FromArgb(26, 147, 112, 255));
                    row.MouseLeave += (s, ev) => row.Background = Brushes.Transparent;
                    DetPanel.Children.Add(row);
                }
            }

            AddSect("ЗАПИСЬ");
            // иероглифы — отдельными фрагментами шрифтом Segoe UI Historic (как в читальне)
            var rec = new TextBlock { FontSize = 13.5, TextWrapping = TextWrapping.Wrap,
                LineHeight = 22, Foreground = (Brush)FindResource("DimBrush"), Margin = new Thickness(0, 2, 0, 10) };
            string body = PuaToUni(d.Text ?? "");
            var hist = new FontFamily("Segoe UI Historic");
            foreach (System.Text.RegularExpressions.Match m in
                System.Text.RegularExpressions.Regex.Matches(body,
                    "(?:\uD80C[\uDC00-\uDFFF]|\uD80D[\uDC00-\uDC2E])+|(?:(?!\uD80C)(?!\uD80D)[\\s\\S])+"))
            {
                bool hiero = m.Value.Length > 1 && m.Value[0] >= 0xD80C && m.Value[0] <= 0xD80D;
                var run = new System.Windows.Documents.Run(m.Value);
                if (hiero) { run.FontFamily = hist; run.FontSize = 17; }
                rec.Inlines.Add(run);
            }
            DetPanel.Children.Add(rec);
            AddTextEditor(d);

            // гадательные окна: открываются сами по себе, поверх карты
            AddSect("СПРОСИТЬ У ЗНАКОВ");
            var oracles = new WrapPanel { Margin = new Thickness(0, 2, 0, 8) };
            oracles.Children.Add(OracleBtn("☯ И Цзин", "Книга Перемен: бросить монеты и прочесть гексаграмму",
                () => new Stalkers.IChingWindow()));
            oracles.Children.Add(OracleBtn("🂠 Пасьянс Медичи", "Расклад Медичи: сойдётся ли задуманное",
                () => new Stalkers.MediciWindow()));
            // тональпоуалли берёт день сна и его образ прямо из карточки
            DateTime dd;
            DateTime? dreamDay = DateTime.TryParse(d.Date, out dd) ? dd : (DateTime?)null;
            string dreamImage = d.Analysis != null && !string.IsNullOrWhiteSpace(d.Analysis.Location)
                ? d.Analysis.Location
                : (d.Analysis != null && d.Analysis.Symbols != null && d.Analysis.Symbols.Count > 0
                    ? d.Analysis.Symbols[0] : d.Title);
            oracles.Children.Add(OracleBtn("𖤍 Тональпоуалли", "Ацтекский счёт дней: что день делает с образом сна",
                () => new Stalkers.TonalpohualliWindow(dreamDay, dreamImage)));
            oracles.Children.Add(OracleBtn("◈ Цитэ", "Гадание майя: цолькин и красные семена, разложенные по четыре",
                () => new Stalkers.TziteWindow(dreamDay, dreamImage)));
            oracles.Children.Add(OracleBtn("◐ Оби", "Оби (йоруба): не сонник, а проверка догадки — орех отвечает «да/нет»",
                () => new Stalkers.ObiWindow(dreamImage)));
            DetPanel.Children.Add(oracles);

            RightPanel.Visibility = Visibility.Visible;
        }

        // окна-спутники живут своей жизнью: одно на каждый вид, второй раз — просто поднимаем
        readonly Dictionary<string, Window> _satellites = new Dictionary<string, Window>();

        Button OracleBtn(string label, string tip, Func<Window> make)
        {
            var b = new Button
            {
                Style = (Style)FindResource("Btn"), Content = label, ToolTip = tip,
                FontFamily = new FontFamily("Segoe UI, Segoe UI Emoji, Segoe UI Symbol"),
                Margin = new Thickness(0, 0, 8, 8)
            };
            b.Click += (s, e) => OpenSatellite(label + "|" + _currentId, make);
            return b;
        }

        void OpenSatellite(string key, Func<Window> make)
        {
            Window w;
            if (_satellites.TryGetValue(key, out w) && w.IsLoaded)
            {
                if (w.WindowState == WindowState.Minimized) w.WindowState = WindowState.Normal;
                w.Activate();
                return;
            }
            try
            {
                w = make();
                w.Owner = this;                       // поверх карты, но окно самостоятельное
                w.Closed += (s, e) => _satellites.Remove(key);
                _satellites[key] = w;
                w.Show();
            }
            catch (Exception ex) { Toast(key + ": " + ex.Message); }
        }

        void AddSect(string t)
        {
            DetPanel.Children.Add(new TextBlock { Text = t, FontSize = 10.5,
                Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(0, 15, 0, 4) });
        }

        void AddChips(List<string> items, string fg, string bg)
        {
            var wrap = new WrapPanel();
            foreach (var it in items)
            {
                if (string.IsNullOrEmpty(it)) continue;
                wrap.Children.Add(new Border
                {
                    CornerRadius = new CornerRadius(it.Length > 40 ? 12 : 99),
                    Padding = new Thickness(11, 5, 11, 6),
                    Margin = new Thickness(0, 0, 6, 6),
                    Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(bg)),
                    BorderBrush = (Brush)FindResource("BorderBrush2"), BorderThickness = new Thickness(1),
                    Child = new TextBlock { Text = it, FontSize = 12, TextWrapping = TextWrapping.Wrap,
                        MaxWidth = 340,
                        FontFamily = new FontFamily("Segoe UI, Segoe UI Historic"),
                        Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(fg)) }
                });
            }
            DetPanel.Children.Add(wrap);
        }
    }
}
