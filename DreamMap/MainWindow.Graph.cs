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
        /* ================= граф ================= */
        class Node
        {
            public Dream D;
            public double X, Y, Z, VX, VY, VZ;   // мир (3D, сфера)
            public double PX, PY, K, Z2;        // проекция на экран
            public FrameworkElement El;
            public bool Drag;
            public bool Pinned;                  // авторская позиция — физика не трогает
            public bool IsPlanet;                // планета-локация
            public bool Founded;                 // есть книга-фундамент
            public int Rings;                    // кольца ранга сновидца в космосе (1–4)
            public string Sub;                   // подпись под именем: локация сна без планеты
            public double Rad = 37;              // радиус круга (для обрезки нитей по грани)
        }
        class Edge
        {
            public Node A, B;
            public Line Line;
        }
        readonly Dictionary<string, Node> _nodes = new Dictionary<string, Node>();
        readonly List<Edge> _edges = new List<Edge>();
        int _simSteps;

        /* --- вращение сферы и зум карты --- */
        readonly ScaleTransform _zoomT = new ScaleTransform(1, 1);
        readonly TranslateTransform _panT = new TranslateTransform(0, 0);
        double _zoom = 1;
        double _yaw, _pitch;                  // (устарело: карта не вращается, всегда 0)
        bool _panning, _panMoved;
        Point _panStart;

        void InitMapTransform()
        {
            var g = new TransformGroup();
            g.Children.Add(_zoomT); g.Children.Add(_panT);
            MapLayer.RenderTransform = g;   // масштаб/сдвиг несёт слой узлов, а не ловушка захвата
            Map.Cursor = Cursors.SizeAll;   // над картой — курсор «схватить и двигать»
            // если захват мыши внезапно потерян (фокус, другое окно) — чисто завершаем сдвиг
            Map.LostMouseCapture += (s, e) => { if (_panning) EndPan(); };
        }

        void EndPan()
        {
            if (!_panning) return;
            _panning = false;
            if (Map.IsMouseCaptured) Map.ReleaseMouseCapture();
            if (_panMoved) QueueViewSave();   // сдвиг — часть личного вида
        }

        DispatcherTimer _zoomSaveTimer;

        void Map_Wheel(object sender, MouseWheelEventArgs e)
        {
            var p = e.GetPosition(Root);
            double k = e.Delta > 0 ? 1.15 : 1 / 1.15;
            double nz = Math.Max(0.25, Math.Min(3.5, _zoom * k));
            k = nz / _zoom;
            if (Math.Abs(k - 1) < 0.0001) return;
            _panT.X = p.X - k * (p.X - _panT.X);
            _panT.Y = p.Y - k * (p.Y - _panT.Y);
            _zoom = nz;
            _zoomT.ScaleX = _zoomT.ScaleY = nz;
            e.Handled = true;
            QueueViewSave();
        }

        // личный вид (зум + повороты): локально и (с задержкой) в аккаунт со штампом времени
        void QueueViewSave()
        {
            if (_zoomSaveTimer == null)
            {
                _zoomSaveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(900) };
                _zoomSaveTimer.Tick += async (s, e) =>
                {
                    _zoomSaveTimer.Stop();
                    _settings.MapZoom = _zoom;
                    _settings.MapPanX = _panT.X;
                    _settings.MapPanY = _panT.Y;
                    Store.SaveSettings(_settings);
                    if (_site != null && _siteRole != null)
                    {
                        try
                        {
                            var r = await _site.PostJson("save_view",
                                new { zoom = _zoom, panx = _panT.X, pany = _panT.Y });
                            _settings.ViewTime = (string)r["time"];
                            Store.SaveSettings(_settings);
                        }
                        catch { }
                    }
                };
            }
            _zoomSaveTimer.Stop();
            _zoomSaveTimer.Start();
        }

        void SetZoomCentered(double nz)
        {
            nz = Math.Max(0.25, Math.Min(3.5, nz));
            var p = new Point(ActualWidth / 2, ActualHeight / 2);
            double k = nz / _zoom;
            _panT.X = p.X - k * (p.X - _panT.X);
            _panT.Y = p.Y - k * (p.Y - _panT.Y);
            _zoom = nz;
            _zoomT.ScaleX = _zoomT.ScaleY = nz;
        }

        void Map_PanDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount == 2) // двойной клик по пустому месту — сброс вида
            {
                EndPan();
                _zoom = 1; _zoomT.ScaleX = _zoomT.ScaleY = 1;
                _panT.X = _panT.Y = 0;
                QueueViewSave();
                e.Handled = true;
                return;
            }
            _panning = true;
            _panMoved = false;
            _panStart = e.GetPosition(Root);
            Map.CaptureMouse();
            e.Handled = true;   // захват сразу за нами — событие не уходит выше
        }

        // перетаскивание пустого места сдвигает карту по X/Y (без вращения)
        void Map_PanMove(object sender, MouseEventArgs e)
        {
            if (!_panning) return;
            if (e.LeftButton != MouseButtonState.Pressed) { EndPan(); return; }  // кнопку отпустили вне карты
            var p = e.GetPosition(Root);
            double dx = p.X - _panStart.X, dy = p.Y - _panStart.Y;
            if (!_panMoved && dx == 0 && dy == 0) return;
            _panMoved = true;
            _panT.X += dx;
            _panT.Y += dy;
            _panStart = p;
        }

        void Map_PanUp(object sender, MouseButtonEventArgs e)
        {
            EndPan();
        }

        /* проекция сферы на экран: вращение yaw/pitch + перспектива */
        void Render()
        {
            double w = Map.ActualWidth > 0 ? Map.ActualWidth : ActualWidth;
            double h = Map.ActualHeight > 0 ? Map.ActualHeight : ActualHeight;
            double cx = w / 2, cy = h / 2 + 20;
            double cosY = Math.Cos(_yaw), sinY = Math.Sin(_yaw);
            double cosP = Math.Cos(_pitch), sinP = Math.Sin(_pitch);
            const double F = 1100;
            foreach (var n in _nodes.Values)
            {
                double x = n.X - cx, y = n.Y - cy, z = n.Z;
                double x1 = x * cosY + z * sinY, z1 = -x * sinY + z * cosY;
                double y2 = y * cosP - z1 * sinP, z2 = y * sinP + z1 * cosP;
                double k = F / (F + z2);
                if (k < 0.15) k = 0.15; if (k > 4) k = 4;
                n.PX = cx + x1 * k; n.PY = cy + y2 * k; n.K = k; n.Z2 = z2;
                // центр КРУГА точно в (PX, PY): смещение и масштаб считаются от него,
                // тогда нити, обрезанные на Rad*K, ложатся ровно на грань
                double halfW = 65;   // ширина стопки узла 130
                Canvas.SetLeft(n.El, n.PX - halfW);
                Canvas.SetTop(n.El, n.PY - n.Rad);
                var st = n.El.RenderTransform as ScaleTransform;
                if (st == null) { st = new ScaleTransform(); n.El.RenderTransform = st; }
                st.CenterX = halfW; st.CenterY = n.Rad;
                st.ScaleX = st.ScaleY = k;
                n.El.Opacity = Math.Max(0.4, Math.Min(1, 0.75 + (k - 1) * 0.8));
                Panel.SetZIndex(n.El, (int)(1000 - z2));
            }
            foreach (var e in _edges)
            {
                if (!_settings.MapLinks)                        // нити спрятаны — связь цела, но не видна
                {
                    e.Line.Visibility = Visibility.Collapsed;
                    continue;
                }
                // нить от грани круга до грани, не от центра
                double dx = e.B.PX - e.A.PX, dy = e.B.PY - e.A.PY;
                double dist = Math.Sqrt(dx * dx + dy * dy);
                double offA = e.A.Rad * e.A.K, offB = e.B.Rad * e.B.K;
                if (dist <= offA + offB + 2 || dist < 0.01)
                {
                    e.Line.Visibility = Visibility.Collapsed;   // круги соприкасаются
                    continue;
                }
                e.Line.Visibility = Visibility.Visible;
                double ux = dx / dist, uy = dy / dist;
                e.Line.X1 = e.A.PX + ux * offA; e.Line.Y1 = e.A.PY + uy * offA;
                e.Line.X2 = e.B.PX - ux * offB; e.Line.Y2 = e.B.PY - uy * offB;
            }
        }

        void RebuildGraph()
        {
            if (_cosmosMode) { BuildCosmosGraph(); return; }
            DreamersPanel.Visibility = Visibility.Collapsed;   // список сновидцев — только в космосе
            MapLayer.Children.Clear();
            _nodes.Clear(); _edges.Clear();
            bool has = Cur.Count > 0;
            EmptyState.Visibility = has ? Visibility.Collapsed : Visibility.Visible;
            Legend.Visibility = has ? Visibility.Visible : Visibility.Collapsed;
            if (!has) return;

            double w = Math.Max(ActualWidth, 800), h = Math.Max(ActualHeight, 500);
            double R = Math.Min(w, h) * 0.3;
            double ccx = w / 2, ccy = h / 2 + 20;
            foreach (var d in Cur)
            {
                // авторские координаты — если сохранены; иначе позиция из хэша id
                bool authored = d.PosX.HasValue && d.PosY.HasValue && d.PosZ.HasValue;
                var n = new Node
                {
                    D = d,
                    Pinned = authored,
                    X = authored ? ccx + d.PosX.Value : ccx + (Hash01(d.Id, 1) - 0.5) * 2 * R,
                    Y = authored ? ccy + d.PosY.Value : ccy + (Hash01(d.Id, 2) - 0.5) * 1.6 * R,
                    Z = authored ? d.PosZ.Value : (Hash01(d.Id, 3) - 0.5) * 1.6 * R
                };
                _nodes[d.Id] = n;
            }

            // планеты: локация = планета, сны — спутники; нити «локация» несёт сама планета
            var groups = new Dictionary<string, List<Dream>>();
            var groupNames = new Dictionary<string, string>();
            foreach (var d in Cur)
            {
                string loc = d.Analysis != null ? (d.Analysis.Location ?? "").Trim() : "";
                if (loc.Length == 0) continue;
                string k = loc.ToLowerInvariant();
                if (!groups.ContainsKey(k)) { groups[k] = new List<Dream>(); groupNames[k] = loc; }
                groups[k].Add(d);
            }
            var foundedLocs = new HashSet<string>();
            if (_viewDreams != null) foundedLocs = _viewFounded;   // фундаменты сновидца — с сайта
            else if (_books != null)
                foreach (Newtonsoft.Json.Linq.JObject bb in _books)
                {
                    string bl = ((string)bb["location"] ?? "").Trim();
                    if (bl.Length > 0) foundedLocs.Add(bl.ToLowerInvariant());
                }
            // планета нужна там, где ей есть кого собирать: два и более снов либо
            // книга-фундамент. Локация с единственным сном не двоится лишним шаром.
            foreach (var solo in groups.Where(g => g.Value.Count < 2 &&
                                                   !foundedLocs.Contains(g.Key)).ToList())
            {
                // планеты не будет — само название места уходит подписью под сон
                foreach (var d in solo.Value)
                    if (_nodes.ContainsKey(d.Id)) _nodes[d.Id].Sub = groupNames[solo.Key];
                groups.Remove(solo.Key);
            }

            var planetSrc = _viewDreams != null ? _viewPlanetPos : _planetPos;
            foreach (var kv in groups)
            {
                PlanetPos pp;
                bool pAuthored = planetSrc.TryGetValue(kv.Key, out pp);
                var pn = new Node
                {
                    D = new Dream { Id = "P:" + kv.Key, Title = groupNames[kv.Key] },
                    IsPlanet = true,
                    Pinned = true,   // планета стоит на месте — кольцо не разъезжается
                    Founded = foundedLocs.Contains(kv.Key),
                    X = pAuthored ? ccx + pp.X : w / 2 + (Hash01(kv.Key, 11) - 0.5) * 2 * R,
                    Y = pAuthored ? ccy + pp.Y : h / 2 + 20 + (Hash01(kv.Key, 12) - 0.5) * 1.6 * R,
                    Z = pAuthored ? pp.Z : (Hash01(kv.Key, 13) - 0.5) * 1.6 * R
                };
                _nodes[pn.D.Id] = pn;

                // спутники без авторских координат — ровным кольцом по орбите
                var sats = kv.Value.OrderBy(d => d.Date ?? "").ThenBy(d => d.Id).ToList();
                double orbR = Math.Max(150, 70 + sats.Count * 24);
                for (int si = 0; si < sats.Count; si++)
                {
                    var sn = _nodes[sats[si].Id];
                    if (sats[si].PosX.HasValue) continue;   // авторская позиция дороже орбиты
                    double ang = 2 * Math.PI * si / sats.Count - Math.PI / 2;
                    sn.X = pn.X + Math.Cos(ang) * orbR;
                    sn.Y = pn.Y + Math.Sin(ang) * orbR * 0.8;
                    sn.Z = pn.Z + Math.Sin(ang * 2) * 34;
                    sn.Pinned = true;   // кольцо фиксировано, физика его не мнёт
                }
            }

            var seen = new HashSet<string>();
            foreach (var d in Cur)
                foreach (var l in d.Links ?? new List<Link>())
                {
                    if (l.Type == "локация") continue;   // локацию теперь несёт планета
                    if (!_nodes.ContainsKey(l.Id)) continue;
                    string key = string.CompareOrdinal(d.Id, l.Id) < 0 ? d.Id + "|" + l.Id + l.Type : l.Id + "|" + d.Id + l.Type;
                    if (!seen.Add(key)) continue;
                    Color c = LinkColors.ContainsKey(l.Type) ? LinkColors[l.Type] : Colors.Gray;
                    var line = new Line
                    {
                        Stroke = new SolidColorBrush(Color.FromArgb(150, c.R, c.G, c.B)),
                        StrokeThickness = 1.7,
                        ToolTip = l.Type + (string.IsNullOrEmpty(l.Reason) ? "" : ": " + l.Reason)
                    };
                    MapLayer.Children.Add(line);
                    _edges.Add(new Edge { A = _nodes[d.Id], B = _nodes[l.Id], Line = line });
                }
            foreach (var kv in groups)
            {
                var pc = LinkColors["локация"];
                foreach (var d in kv.Value)
                {
                    var line = new Line
                    {
                        Stroke = new SolidColorBrush(Color.FromArgb(120, pc.R, pc.G, pc.B)),
                        StrokeThickness = 1.4,
                        ToolTip = "спутник планеты «" + groupNames[kv.Key] + "»"
                    };
                    MapLayer.Children.Add(line);
                    _edges.Add(new Edge { A = _nodes["P:" + kv.Key], B = _nodes[d.Id], Line = line });
                }
            }

            foreach (var n in _nodes.Values)
            {
                n.El = MakeNodeElement(n);
                MapLayer.Children.Add(n.El);
            }
            // сеть фиксированная: раскладка просчитывается сразу и замирает
            for (int i = 0; i < 300; i++) SimStep();
            Render();
        }

        // космос: каждая звезда — сновидец, пунктирные нити — мосты между их картами
        void BuildCosmosGraph()
        {
            MapLayer.Children.Clear();
            _nodes.Clear(); _edges.Clear();
            EmptyState.Visibility = Visibility.Collapsed;
            Legend.Visibility = Visibility.Visible;
            if (_cosmosUsers == null) return;

            double w = Math.Max(ActualWidth, 800), h = Math.Max(ActualHeight, 500);
            double R = Math.Min(w, h) * 0.34;
            double ccx = w / 2, ccy = h / 2 + 20;
            foreach (Newtonsoft.Json.Linq.JObject u in _cosmosUsers)
            {
                string id = "U:" + (int)u["id"];
                _nodes[id] = new Node
                {
                    D = new Dream { Id = id, Title = MarkOf((string)u["role"]) + " "
                        + (string)u["login"] + " · " + (int)u["n"] },
                    IsPlanet = true, Pinned = true,
                    Founded = (int)u["id"] == _siteUid,      // своя звезда — твёрдая, с золотым ободом
                    Rings = RankOf((string)u["role"]),       // колец ровно столько, сколько ступеней ранга
                    X = ccx + (Hash01(id, 21) - 0.5) * 2 * R,
                    Y = ccy + (Hash01(id, 22) - 0.5) * 1.5 * R,
                    Z = (Hash01(id, 23) - 0.5) * 1.5 * R
                };
            }
            // мосты пары сновидцев складываются в одну нить
            var pairN = new Dictionary<string, int>();
            var pairType = new Dictionary<string, string>();
            if (_cosmosBridges != null)
                foreach (Newtonsoft.Json.Linq.JObject b in _cosmosBridges)
                {
                    int ua = (int)b["ua"], ub = (int)b["ub"];
                    string k = Math.Min(ua, ub) + "|" + Math.Max(ua, ub);
                    if (!pairN.ContainsKey(k)) { pairN[k] = 0; pairType[k] = (string)b["type"]; }
                    pairN[k]++;
                }
            foreach (var kv in pairN)
            {
                var p = kv.Key.Split('|');
                string a = "U:" + p[0], bId = "U:" + p[1];
                if (!_nodes.ContainsKey(a) || !_nodes.ContainsKey(bId)) continue;
                Color c = LinkColors.ContainsKey(pairType[kv.Key]) ? LinkColors[pairType[kv.Key]] : Colors.Gray;
                var line = new Line
                {
                    Stroke = new SolidColorBrush(Color.FromArgb(150, c.R, c.G, c.B)),
                    StrokeThickness = 1.7,
                    StrokeDashArray = new DoubleCollection { 5, 4 },
                    ToolTip = "мост между картами · нитей: " + kv.Value
                };
                MapLayer.Children.Add(line);
                _edges.Add(new Edge { A = _nodes[a], B = _nodes[bId], Line = line });
            }
            foreach (var n in _nodes.Values)
            {
                n.El = MakeNodeElement(n);
                MapLayer.Children.Add(n.El);
            }
            Render();
            BuildDreamersList();
        }

        // список сновидцев справа (как на сайте): клик — открыть карту
        void BuildDreamersList()
        {
            DreamersList.Children.Clear();
            foreach (Newtonsoft.Json.Linq.JObject u in _cosmosUsers)
            {
                int uid = (int)u["id"];
                var row = new Border
                {
                    CornerRadius = new CornerRadius(9), Padding = new Thickness(10, 7, 10, 7),
                    Margin = new Thickness(2, 0, 2, 2), Cursor = Cursors.Hand, Background = Brushes.Transparent
                };
                var dp = new DockPanel();
                var cnt = new TextBlock
                {
                    Text = (int)u["n"] + "",
                    Foreground = (Brush)FindResource("FaintBrush"), FontSize = 12,
                    VerticalAlignment = VerticalAlignment.Center
                };
                DockPanel.SetDock(cnt, System.Windows.Controls.Dock.Right);
                dp.Children.Add(cnt);
                dp.Children.Add(new TextBlock
                {
                    Text = MarkOf((string)u["role"]) + " " + (string)u["login"],
                    FontFamily = new FontFamily("Segoe UI, Segoe UI Emoji"),
                    Foreground = (Brush)FindResource("TextBrush"), FontSize = 13,
                    TextTrimming = TextTrimming.CharacterEllipsis, VerticalAlignment = VerticalAlignment.Center
                });
                row.Child = dp;
                row.MouseLeftButtonUp += (s, e) => OpenUserMap(uid);
                row.MouseEnter += (s, e) => row.Background = new SolidColorBrush(Color.FromArgb(30, 147, 112, 255));
                row.MouseLeave += (s, e) => row.Background = Brushes.Transparent;
                DreamersList.Children.Add(row);
            }
            DreamersPanel.Visibility = _cosmosUsers.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        }

        static double Hash01(string s, int salt)
        {
            unchecked
            {
                uint h = 2166136261;
                foreach (char c in s ?? "") { h ^= c; h *= 16777619; }
                h ^= (uint)salt * 2654435761u; h *= 16777619;
                return (h % 100000u) / 100000.0;
            }
        }

        static readonly Dictionary<string, Brush> _haloBrushes = new Dictionary<string, Brush>();

        /// <summary>Мягкое свечение вокруг круга диаметром size: от края круга наружу на spread.</summary>
        static FrameworkElement MakeHalo(double size, double spread, string color)
        {
            string key = size + "|" + spread + "|" + color;
            Brush b;
            if (!_haloBrushes.TryGetValue(key, out b))
            {
                var c = (Color)ColorConverter.ConvertFromString(color);
                double r = size / 2, R = r + spread, edge = r / R;
                var g = new RadialGradientBrush();
                g.GradientStops.Add(new GradientStop(Color.FromArgb(140, c.R, c.G, c.B), 0));
                g.GradientStops.Add(new GradientStop(Color.FromArgb(140, c.R, c.G, c.B), edge));
                g.GradientStops.Add(new GradientStop(Color.FromArgb(55, c.R, c.G, c.B), edge + (1 - edge) * 0.35));
                g.GradientStops.Add(new GradientStop(Color.FromArgb(14, c.R, c.G, c.B), edge + (1 - edge) * 0.7));
                g.GradientStops.Add(new GradientStop(Color.FromArgb(0, c.R, c.G, c.B), 1));
                g.Freeze();
                _haloBrushes[key] = b = g;
            }
            return new Ellipse
            {
                Width = size + spread * 2, Height = size + spread * 2,
                Margin = new Thickness(-spread), Fill = b, IsHitTestVisible = false
            };
        }

        FrameworkElement MakeNodeElement(Node n)
        {
            // сны прежнего размера, локация — узел помельче, чем сны, что на ней висят
            double es = n.IsPlanet ? 36 : 52;
            n.Rad = es / 2;
            var sp = new StackPanel { Width = 130, Cursor = Cursors.Hand };
            var el = new Ellipse
            {
                Width = es, Height = es,
                Stroke = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                    n.IsPlanet ? (n.Founded ? "#FCD34D" : _colPlanet) : _colDream)),
                StrokeThickness = n.IsPlanet ? 2.5 : 2,
                HorizontalAlignment = HorizontalAlignment.Center
            };
            if (n.IsPlanet)
            {
                // планета: с фундаментом — твёрдая, без — газовая
                var pg = new RadialGradientBrush { GradientOrigin = new Point(0.32, 0.32) };
                if (n.Founded)
                {
                    pg.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#3E7D9E"), 0));
                    pg.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#14283F"), 1));
                }
                else
                {
                    pg.GradientStops.Add(new GradientStop(Color.FromArgb(140, 72, 110, 140), 0));
                    pg.GradientStops.Add(new GradientStop(Color.FromArgb(90, 16, 28, 48), 1));
                }
                el.Fill = pg;
            }
            if (!n.IsPlanet)
            {
                string img = Store.ImagePath(n.D);
                if (img != null)
                {
                    try
                    {
                        var bi = new BitmapImage();
                        bi.BeginInit();
                        bi.CacheOption = BitmapCacheOption.OnLoad;
                        bi.DecodePixelWidth = 160;
                        bi.UriSource = new Uri(img);
                        bi.EndInit();
                        bi.Freeze();
                        el.Fill = new ImageBrush(bi) { Stretch = Stretch.UniformToFill };
                    }
                    catch { el.Fill = DarkNodeFill(); }
                }
                else el.Fill = DarkNodeFill();
            }

            var lbl = new TextBlock
            {
                Text = n.D.Title, FontSize = n.IsPlanet ? 11 : 12.5, TextAlignment = TextAlignment.Center,
                TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 5, 0, 0),
                // Segoe UI Emoji — чтобы метки ролей (👑 ⚜️ 🛡️ ☾) не выпадали квадратиками
                FontFamily = new FontFamily("Segoe UI, Segoe UI Emoji, Segoe UI Symbol"),
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#CFC7F2"))
            };
            // свечение вокруг узла — нарисованный ореол: на вид то же, что эффект тени,
            // но не пересчитывается при каждом движении карты
            var glow = new Grid { Width = es, Height = es, HorizontalAlignment = HorizontalAlignment.Center };
            glow.Children.Add(MakeHalo(es, n.IsPlanet ? 26 : 18, n.IsPlanet ? "#7DD3FC" : "#9370FF"));
            glow.Children.Add(el);
            FrameworkElement head = glow;
            bool tiltRing = n.IsPlanet && n.Founded && n.Rings == 0;   // фундамент планеты-локации
            if (tiltRing || n.Rings > 0)
            {
                var gold = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#FCD34D"));
                var g = new Grid { Width = es, Height = es, HorizontalAlignment = HorizontalAlignment.Center };
                g.Children.Add(glow);
                // Canvas не обрезает детей — кольца свободно выходят за рамку узла
                var cv = new Canvas { Width = es, Height = es, IsHitTestVisible = false };
                if (tiltRing)
                {
                    var ring = new Ellipse
                    {
                        Width = es * 1.55, Height = es * 0.45,
                        Stroke = gold, StrokeThickness = 1.5, Opacity = 0.8,
                        RenderTransformOrigin = new Point(0.5, 0.5),
                        RenderTransform = new RotateTransform(-26)
                    };
                    Canvas.SetLeft(ring, (es - ring.Width) / 2);
                    Canvas.SetTop(ring, (es - ring.Height) / 2);
                    cv.Children.Add(ring);
                }
                for (int i = 1; i <= n.Rings; i++)   // круги ранга: сколько ступеней — столько колец
                {
                    double d = es * (1 + 0.10 * i);
                    var ring = new Ellipse
                    {
                        Width = d, Height = d,
                        Stroke = gold, StrokeThickness = 1.3,
                        Opacity = Math.Max(0.25, 0.75 - 0.10 * i)
                    };
                    Canvas.SetLeft(ring, (es - d) / 2);
                    Canvas.SetTop(ring, (es - d) / 2);
                    cv.Children.Add(ring);
                }
                g.Children.Add(cv);
                head = g;
            }
            sp.Children.Add(head); sp.Children.Add(lbl);
            // локация сна, у которого нет своей планеты — тихой второй строкой
            if (!string.IsNullOrEmpty(n.Sub))
                sp.Children.Add(new TextBlock
                {
                    Text = n.Sub, FontSize = 10, TextAlignment = TextAlignment.Center,
                    TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 1, 0, 0),
                    FontFamily = new FontFamily("Segoe UI"),
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7DD3FC")),
                    Opacity = 0.75
                });

            Point downPos = new Point(); bool moved = false;
            sp.MouseLeftButtonDown += (s, e) =>
            {
                if (e.ClickCount == 2 && n.IsPlanet && !n.D.Id.StartsWith("U:"))
                {
                    AlignOrbit(n);   // двойной клик по планете — выровнять орбиты
                    e.Handled = true;
                    return;
                }
                n.Drag = true; moved = false; downPos = e.GetPosition(MapLayer);
                sp.CaptureMouse(); Panel.SetZIndex(sp, 100);
                e.Handled = true;
            };
            sp.MouseMove += (s, e) =>
            {
                if (!n.Drag) return;
                var p = e.GetPosition(MapLayer);
                if ((p - downPos).Length > 5) moved = true;
                if (moved)
                {
                    // обратная проекция: экран -> сфера, глубина узла сохраняется
                    double w = Map.ActualWidth > 0 ? Map.ActualWidth : ActualWidth;
                    double h = Map.ActualHeight > 0 ? Map.ActualHeight : ActualHeight;
                    double cx = w / 2, cy = h / 2 + 20;
                    double k = n.K <= 0 ? 1 : n.K;
                    double x1 = (p.X - cx) / k, y2 = (p.Y - cy) / k, z2 = n.Z2;
                    double cosY = Math.Cos(_yaw), sinY = Math.Sin(_yaw);
                    double cosP = Math.Cos(_pitch), sinP = Math.Sin(_pitch);
                    double y = y2 * cosP + z2 * sinP, z1 = -y2 * sinP + z2 * cosP;
                    double x = x1 * cosY - z1 * sinY, z = x1 * sinY + z1 * cosY;
                    n.X = cx + x; n.Y = cy + y; n.Z = z;
                    n.VX = n.VY = n.VZ = 0;
                    Render();   // двигается только этот узел — остальная сеть зафиксирована
                }
            };
            sp.MouseLeftButtonUp += (s, e) =>
            {
                n.Drag = false; sp.ReleaseMouseCapture(); Panel.SetZIndex(sp, 1);
                if (!moved)
                {
                    if (n.D.Id.StartsWith("U:"))   // клик по сновидцу — вход в его карту
                        OpenUserMap(int.Parse(n.D.Id.Substring(2)));
                    else if (!n.IsPlanet) OpenDetails(n.D.Id);
                    return;
                }
                // авторская координата (со штампом времени): локально и в базу сайта
                n.Pinned = true;
                if (n.D.Id.StartsWith("U:")) return;   // расстановка космоса не сохраняется
                double pcx = ActualWidth / 2, pcy = ActualHeight / 2 + 20;
                if (_viewDreams == null)
                {
                    if (n.IsPlanet)
                    {
                        string key = n.D.Id.Substring(2);
                        _planetPos[key] = new PlanetPos
                        {
                            X = n.X - pcx, Y = n.Y - pcy, Z = n.Z,
                            Time = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss")
                        };
                        Store.SavePlanets(_planetPos);
                        PushPlanetPos(key);
                        return;
                    }
                    n.D.PosX = n.X - pcx; n.D.PosY = n.Y - pcy; n.D.PosZ = n.Z;
                    n.D.PosTime = DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm:ss");
                    Store.SaveDreams(_dreams);
                    PushDreamPos(n.D);
                }
                else if (_viewUid > 0)   // карта сновидца: правка уходит в его базу (по иерархии)
                {
                    if (n.IsPlanet)
                    {
                        string key = n.D.Id.Substring(2);
                        _viewPlanetPos[key] = new PlanetPos { X = n.X - pcx, Y = n.Y - pcy, Z = n.Z };
                        PushForeignPlanet(key);
                        return;
                    }
                    n.D.PosX = n.X - pcx; n.D.PosY = n.Y - pcy; n.D.PosZ = n.Z;
                    PushForeignDream(n.D);
                }
            };
            return sp;
        }

        // двойной клик по планете: спутники возвращаются на ровную орбиту,
        // их авторские координаты стираются локально и в базе сайта
        async void AlignOrbit(Node planet)
        {
            string key = planet.D.Id.Substring(2);
            var sats = Cur.Where(d => d.Analysis != null &&
                (d.Analysis.Location ?? "").Trim().ToLowerInvariant() == key).ToList();
            if (sats.Count == 0) return;
            foreach (var d in sats) { d.PosX = null; d.PosY = null; d.PosZ = null; }
            if (_viewDreams == null)
            {
                Store.SaveDreams(_dreams);
                if (_site != null && _siteRole != null)
                    try
                    {
                        var items = new List<object>();
                        foreach (var d in sats)
                            if (_posMap.ContainsKey(d.Id))
                                items.Add(new { id = _posMap[d.Id], x = (double?)null, y = (double?)null, z = (double?)null });
                        if (items.Count > 0)
                            await _site.PostJson("save_positions", new { items = items });
                    }
                    catch { }
            }
            else if (_site != null && _viewUid > 0)   // орбиты сновидца — в его базу (по иерархии)
            {
                try
                {
                    var items = new List<object>();
                    foreach (var d in sats)
                        if (_viewPosMap.ContainsKey(d.Id))
                            items.Add(new { id = _viewPosMap[d.Id], x = (double?)null, y = (double?)null, z = (double?)null });
                    if (items.Count > 0)
                        await _site.PostJson("save_positions", new { uid = _viewUid, items = items });
                }
                catch (Exception ex) { Toast("Орбиты: " + ex.Message); }
            }
            RebuildGraph();
            Toast("Орбиты «" + planet.D.Title + "» выровнены");
        }

        Brush DarkNodeFill()
        {
            var b = new RadialGradientBrush { GradientOrigin = new Point(0.3, 0.3) };
            b.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#2B2158"), 0));
            b.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#120D2A"), 1));
            return b;
        }

        // таймер физики нужен только при перетаскивании узла — после он сам замирает
        void WakeSim()
        {
            _simSteps = 251;   // порог остановки уже пройден: замрёт, как только успокоится
            if (_simTimer == null)
            {
                _simTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(25) };
                _simTimer.Tick += (s, e) => SimTick();
            }
            _simTimer.Start();
        }

        void SimTick()
        {
            if (_nodes.Count == 0) { _simTimer.Stop(); return; }
            double motion = SimStep();
            Render();
            _simSteps++;
            if (_simSteps > 250 && motion < 0.6) _simTimer.Stop();
        }

        double SimStep()
        {
            if (_nodes.Count == 0) return 0;
            double w = ActualWidth, h = ActualHeight;
            double cx = w / 2, cy = h / 2 + 20;
            var list = _nodes.Values.ToList();
            // радиус сферы растёт с числом снов (равномерная плотность), а не фиксирован:
            // одинокие сны не разлетаются к краям космоса
            double R = Math.Min(Math.Min(w, h) * 0.38,
                90 + 52 * Math.Pow(list.Count, 1.0 / 3));

            foreach (var a in list)
            {
                if (a.Drag || a.Pinned) continue;
                double fx = (cx - a.X) * 0.0028, fy = (cy - a.Y) * 0.0028, fz = -a.Z * 0.0028;
                foreach (var b in list)
                {
                    if (a == b) continue;
                    double dx = a.X - b.X, dy = a.Y - b.Y, dz = a.Z - b.Z;
                    double d2 = dx * dx + dy * dy + dz * dz + 60;
                    if (d2 > 490000) continue;   // дальше 700 — отталкивание ничтожно, не считаем
                    double f = 15000 / d2;
                    double d = Math.Sqrt(d2);
                    fx += dx / d * f; fy += dy / d * f; fz += dz / d * f;
                }
                // мягко удерживаем узлы внутри сферы радиуса R
                double rx = a.X - cx, ry = a.Y - cy, rz = a.Z;
                double dist = Math.Sqrt(rx * rx + ry * ry + rz * rz) + 0.01;
                if (dist > R)
                {
                    double f = (dist - R) * 0.012;   // жёсткая стенка сферы
                    fx -= rx / dist * f; fy -= ry / dist * f; fz -= rz / dist * f;
                }
                a.VX = (a.VX + fx) * 0.80; a.VY = (a.VY + fy) * 0.80; a.VZ = (a.VZ + fz) * 0.80;
                double sp = Math.Sqrt(a.VX * a.VX + a.VY * a.VY + a.VZ * a.VZ);
                if (sp > 6) { a.VX *= 6 / sp; a.VY *= 6 / sp; a.VZ *= 6 / sp; }
            }
            foreach (var e in _edges)
            {
                double dx = e.B.X - e.A.X, dy = e.B.Y - e.A.Y, dz = e.B.Z - e.A.Z;
                double d = Math.Sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
                double f = (d - 210) * 0.004;
                double ux = dx / d, uy = dy / d, uz = dz / d;
                if (!e.A.Drag && !e.A.Pinned) { e.A.VX += ux * f * 8; e.A.VY += uy * f * 8; e.A.VZ += uz * f * 8; }
                if (!e.B.Drag && !e.B.Pinned) { e.B.VX -= ux * f * 8; e.B.VY -= uy * f * 8; e.B.VZ -= uz * f * 8; }
            }
            double motion = 0;
            foreach (var a in list)
            {
                if (!a.Drag && !a.Pinned)
                {
                    a.X += a.VX; a.Y += a.VY; a.Z += a.VZ;
                    motion += Math.Abs(a.VX) + Math.Abs(a.VY) + Math.Abs(a.VZ);
                }
            }
            return motion;
        }
    }
}
