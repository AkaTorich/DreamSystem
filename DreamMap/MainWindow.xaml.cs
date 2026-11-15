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
    public partial class MainWindow : Window
    {
        Settings _settings;
        List<Dream> _dreams;
        Dictionary<string, PlanetPos> _planetPos = new Dictionary<string, PlanetPos>();
        List<Dream> _viewDreams;   // карта другого сновидца, null = моя
        string _viewDreamer;
        int _viewUid = -1;         // чью карту смотрим: правки позиций уходят в его базу
        readonly Dictionary<string, int> _viewPosMap = new Dictionary<string, int>();
        readonly Dictionary<string, PlanetPos> _viewPlanetPos = new Dictionary<string, PlanetPos>();
        readonly HashSet<string> _viewFounded = new HashSet<string>();
        bool _cosmosMode;          // космос: узел = сновидец, клик открывает его карту
        Newtonsoft.Json.Linq.JArray _cosmosUsers, _cosmosBridges;
        string _currentId;
        List<Dream> Cur { get { return _viewDreams ?? _dreams; } }

        static int RankOf(string r)
        { return r == "owner" ? 4 : r == "admin" ? 3 : r == "moder" ? 2 : r == "user" ? 1 : 0; }

        // бейдж «кто я»: логин + роль словом в цвете ранга
        void ShowWho()
        {
            var names = new Dictionary<string, string> { { "owner", "владелец" },
                { "admin", "админ" }, { "moder", "модер" }, { "user", "сновидец" } };
            var cols = new Dictionary<string, string> { { "owner", "#FCD34D" },
                { "admin", "#C084FC" }, { "moder", "#7DD3FC" }, { "user", "#A5B4FC" } };
            WhoAmI.Text = _settings.SiteLogin;
            WhoRole.Text = names.ContainsKey(_siteRole) ? names[_siteRole] : _siteRole;
            WhoRole.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                cols.ContainsKey(_siteRole) ? cols[_siteRole] : "#A5B4FC"));
            WhoChip.Visibility = Visibility.Visible;
            // управление появляется по правам: космос и пользователи — по рангу, дары и доверие — всем
            CosmosBtn.Visibility = RankOf(_siteRole) >= 2 ? Visibility.Visible : Visibility.Collapsed;
            UsersBtn.Visibility = RankOf(_siteRole) >= 2 ? Visibility.Visible : Visibility.Collapsed;
            GiftsBtn.Visibility = Visibility.Visible;
            TrustBtn.Visibility = Visibility.Visible;
        }
        static string MarkOf(string r)
        { return r == "owner" ? "👑" : r == "admin" ? "⚜️" : r == "moder" ? "🛡️" : "☾"; }
        readonly Random _rnd = new Random();
        DispatcherTimer _toastTimer, _simTimer;

        // личная палитра сфер (нити — в LinkColors); тянется из аккаунта сайта
        string _colDream = "#8B7CF8", _colPlanet = "#5FA8CE";

        void ApplySiteColors(Newtonsoft.Json.Linq.JToken user)
        {
            try
            {
                string cj = user == null ? null : (string)user["colors"];
                if (string.IsNullOrEmpty(cj)) return;
                var o = Newtonsoft.Json.Linq.JObject.Parse(cj);
                foreach (var key in new[] { "локация", "персонаж", "эмоция", "символ", "сюжет" })
                    if (o[key] != null)
                        LinkColors[key] = (Color)ColorConverter.ConvertFromString((string)o[key]);
                if (o["dream"] != null) _colDream = (string)o["dream"];
                if (o["planet"] != null) _colPlanet = (string)o["planet"];
                BuildLegend();
                RebuildGraph();
            }
            catch { }
        }

        static readonly Dictionary<string, Color> LinkColors = new Dictionary<string, Color>
        {
            { "локация",  (Color)ColorConverter.ConvertFromString("#7DD3FC") },
            { "персонаж", (Color)ColorConverter.ConvertFromString("#F9A8D4") },
            { "эмоция",   (Color)ColorConverter.ConvertFromString("#FCA5A5") },
            { "символ",   (Color)ColorConverter.ConvertFromString("#FCD34D") },
            { "сюжет",    (Color)ColorConverter.ConvertFromString("#A5B4FC") },
        };

        public MainWindow()
        {
            InitializeComponent();
            Store.EnsureDirs();
            _settings = Store.LoadSettings();
            // данные привязаны к аккаунту: у каждого логина — свой набор снов
            Store.SetAccount(_settings.SiteLogin ?? "", _settings);
            Store.SaveSettings(_settings);
            _dreams = Store.LoadDreams();
            _planetPos = Store.LoadPlanets();
            Loaded += async (s, e) =>
            {
                SetFull(true);
                InitMapTransform();
                if (_settings.MapZoom > 0) SetZoomCentered(_settings.MapZoom);
                _yaw = 0; _pitch = 0;
                _panT.X = _settings.MapPanX; _panT.Y = _settings.MapPanY;
                BuildSky();
                BuildLegend();
                // книги нужны карте сразу — фундаменты планет
                if (_books == null && System.IO.File.Exists(DefaultBooksPath))
                    try
                    {
                        _books = Newtonsoft.Json.Linq.JArray.Parse(
                            System.IO.File.ReadAllText(DefaultBooksPath));
                        _booksPath = DefaultBooksPath;
                    }
                    catch { }
                RebuildGraph();
                if (string.IsNullOrEmpty(_settings.SiteLogin)) OpenSite_Click(null, null);
                // тихий вход в аккаунт сайта: авторские координаты синхронизируются сами
                if (!string.IsNullOrEmpty(_settings.SiteLogin) && !string.IsNullOrEmpty(_settings.SitePass))
                    await TryAutoLogin();

                string layoutReport = LayoutCheckTarget();   // --layout-check: проверка вёрстки всех окон
                if (layoutReport != null) await LayoutCheck(layoutReport);
            };
            SizeChanged += (s, e) => QueueSky();
        }

        /* ================= настройки и мелочи ================= */
        void OpenSettings_Click(object sender, RoutedEventArgs e)
        {
            SGen.IsChecked = _settings.GenImages;
            SettingsOverlay.Visibility = Visibility.Visible;
        }

        void CloseSettings_Click(object sender, RoutedEventArgs e) { SettingsOverlay.Visibility = Visibility.Collapsed; }
        async void SaveSettings_Click(object sender, RoutedEventArgs e)
        {
            _settings.GenImages = SGen.IsChecked == true;
            Store.SaveSettings(_settings);
            // рисовать ли картинку автоматически — единственная ИИ-настройка; всё прочее в аккаунте
            if (_site != null && _siteRole != null)
                try { await _site.PostJson("save_settings", new { gen_images = _settings.GenImages }); }
                catch { }
            SettingsOverlay.Visibility = Visibility.Collapsed;
            Toast("Сохранено");
        }
        void Import_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new Microsoft.Win32.OpenFileDialog
            {
                Title = "Импорт снов",
                Filter = "База снов (dreams.json)|*.json"
            };
            if (dlg.ShowDialog() != true) return;
            try
            {
                var imported = Newtonsoft.Json.JsonConvert.DeserializeObject<List<Dream>>(
                    System.IO.File.ReadAllText(dlg.FileName));
                if (imported == null) throw new Exception("файл пуст");
                int added = 0;
                foreach (var d in imported)
                {
                    if (string.IsNullOrEmpty(d.Id) || string.IsNullOrEmpty(d.Text)) continue;
                    if (d.Id.StartsWith("skybook")) continue;   // книги — в библиотеке, не на карте
                    if (_dreams.Any(x => x.Id == d.Id)) continue;
                    if (d.Links == null) d.Links = new List<Link>();
                    d.Text = PuaToUni(d.Text);   // старые экспорты могли нести PUA-шрифт мода
                    if (d.Analysis != null)
                    {
                        d.Analysis.Summary = PuaToUni(d.Analysis.Summary);
                        d.Analysis.Location = PuaToUni(d.Analysis.Location);
                    }
                    _dreams.Add(d);
                    added++;
                }
                _dreams.Sort((a, b) => string.CompareOrdinal(a.Date ?? "", b.Date ?? ""));
                Store.SaveDreams(_dreams);
                RebuildGraph();
                RenderList();
                Toast(added > 0
                    ? "Импортировано: " + added + " (всего на карте " + _dreams.Count + ")"
                    : "Новых записей нет — всё уже на карте");
            }
            catch (Exception ex) { Toast("Импорт не удался: " + ex.Message); }
        }

        void OpenData_Click(object sender, RoutedEventArgs e)
        {
            Store.EnsureDirs();
            System.Diagnostics.Process.Start("explorer.exe", Store.Dir);
        }
        void HideProg_Click(object sender, RoutedEventArgs e) { ProgOverlay.Visibility = Visibility.Collapsed; }
        bool _full;
        void SetFull(bool on)
        {
            _full = on;
            WindowState = WindowState.Normal;
            // «весь экран» — это рабочая область монитора: панель задач остаётся на виду
            Rect work = WorkAreaHere();
            if (on)
            {
                Left = work.Left; Top = work.Top;
                Width = work.Width; Height = work.Height;
            }
            else
            {
                Width = Math.Min(1280, work.Width); Height = Math.Min(800, work.Height);
                Left = work.Left + (work.Width - Width) / 2;
                Top = work.Top + (work.Height - Height) / 2;
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        struct WinRect { public int L, T, R, B; }
        [StructLayout(LayoutKind.Sequential)]
        struct MonitorInfo { public int Size; public WinRect Monitor, Work; public uint Flags; }
        [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
        [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr mon, ref MonitorInfo info);

        // рабочая область (без панели задач) того монитора, где стоит окно — в единицах WPF
        Rect WorkAreaHere()
        {
            try
            {
                var h = new System.Windows.Interop.WindowInteropHelper(this).Handle;
                var src = PresentationSource.FromVisual(this);
                if (h != IntPtr.Zero && src != null)
                {
                    var mi = new MonitorInfo { Size = Marshal.SizeOf(typeof(MonitorInfo)) };
                    if (GetMonitorInfo(MonitorFromWindow(h, 2), ref mi))   // 2 — ближайший монитор
                    {
                        var m = src.CompositionTarget.TransformFromDevice;
                        var a = m.Transform(new Point(mi.Work.L, mi.Work.T));
                        var b = m.Transform(new Point(mi.Work.R, mi.Work.B));
                        return new Rect(a, b);
                    }
                }
            }
            catch { }
            return SystemParameters.WorkArea;   // окно ещё не показано — основной монитор
        }
        void ToggleFS_Click(object sender, RoutedEventArgs e) { SetFull(!_full); }

        // меню ☰ раскрывается под кнопкой, правым краем к ней
        void More_Click(object sender, RoutedEventArgs e)
        {
            var box = (FrameworkElement)MorePopup.Child;
            box.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            MorePopup.HorizontalOffset = MoreBtn.ActualWidth - box.DesiredSize.Width;
            MorePopup.IsOpen = !MorePopup.IsOpen;
        }
        void MoreItem_Click(object sender, RoutedEventArgs e) { MorePopup.IsOpen = false; }
        void Minimize_Click(object sender, RoutedEventArgs e) { WindowState = WindowState.Minimized; }
        void TopBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount == 2) { ToggleFS_Click(null, null); return; }
            try { DragMove(); } catch { }
        }
        void Close_Click(object sender, RoutedEventArgs e) { Close(); }

        void Window_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Escape)
            {
                CancelBookLink();
                if (EditTextOverlay.Visibility == Visibility.Visible) EditTextCancel_Click(null, null);
                else if (UsersOverlay.Visibility == Visibility.Visible) UsersOverlay.Visibility = Visibility.Collapsed;
                else if (GiftsOverlay.Visibility == Visibility.Visible) GiftsOverlay.Visibility = Visibility.Collapsed;
                else if (TrustOverlay.Visibility == Visibility.Visible) TrustOverlay.Visibility = Visibility.Collapsed;
                else if (SettingsOverlay.Visibility == Visibility.Visible) SettingsOverlay.Visibility = Visibility.Collapsed;
                else if (ProgOverlay.Visibility == Visibility.Visible && ProgClose.Visibility == Visibility.Visible)
                    ProgOverlay.Visibility = Visibility.Collapsed;
                else { LeftPanel.Visibility = Visibility.Collapsed; RightPanel.Visibility = Visibility.Collapsed; }
            }
            if (e.Key == Key.F11) ToggleFS_Click(null, null);
        }

        void Toast(string msg)
        {
            ToastText.Text = msg;
            ToastBox.Visibility = Visibility.Visible;
            if (_toastTimer == null)
            {
                _toastTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(6) };
                _toastTimer.Tick += (s, e) => { ToastBox.Visibility = Visibility.Collapsed; _toastTimer.Stop(); };
            }
            _toastTimer.Stop(); _toastTimer.Start();
        }
    }
}
