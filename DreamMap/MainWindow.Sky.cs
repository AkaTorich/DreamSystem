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
        /* ================= небо ================= */
        void BuildSky()
        {
            double w = ActualWidth > 0 ? ActualWidth : SystemParameters.PrimaryScreenWidth;
            double h = ActualHeight > 0 ? ActualHeight : SystemParameters.PrimaryScreenHeight;

            // Небо собирается во временном холсте и один раз печатается в картинку.
            // В окне остаётся одна картинка вместо сотен звёзд и трёх размытых туманностей,
            // которые иначе пересчитывались бы при каждом движении карты над ними.
            var canvas = new Canvas { Width = w, Height = h };
            canvas.Children.Add(MakeSkyGradient(w, h));

            AddAurora(canvas, w * 0.05, h * 0.02, w * 0.45, "#2B1E6B");
            AddAurora(canvas, w * 0.62, h * 0.55, w * 0.40, "#123A52");
            AddAurora(canvas, w * 0.38, h * 0.60, w * 0.28, "#4A1D5E");

            var starBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#CFD8FF"));
            starBrush.Freeze();
            int n = (int)(w * h / 6500);
            for (int i = 0; i < n; i++)
            {
                double r = _rnd.NextDouble() * 1.6 + 0.4;
                var star = new Ellipse
                {
                    Width = r * 2, Height = r * 2, Fill = starBrush,
                    Opacity = 0.2 + _rnd.NextDouble() * 0.8   // своя яркость, без мерцания
                };
                Canvas.SetLeft(star, _rnd.NextDouble() * w);
                Canvas.SetTop(star, _rnd.NextDouble() * h);
                canvas.Children.Add(star);
            }

            canvas.Measure(new Size(w, h));
            canvas.Arrange(new Rect(0, 0, w, h));
            var dpi = VisualTreeHelper.GetDpi(this);
            var shot = new RenderTargetBitmap(
                (int)Math.Ceiling(w * dpi.DpiScaleX), (int)Math.Ceiling(h * dpi.DpiScaleY),
                dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
            shot.Render(canvas);
            shot.Freeze();

            Sky.Children.Clear();
            Sky.Children.Add(new Image { Source = shot, Width = w, Height = h, Stretch = Stretch.Fill });
        }

        // при растягивании окна размер меняется десятки раз — небо пересобирается,
        // когда окно замрёт, а пока растягивается прежняя картинка
        DispatcherTimer _skyTimer;
        void QueueSky()
        {
            if (_skyTimer == null)
            {
                _skyTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(220) };
                _skyTimer.Tick += (s, e) => { _skyTimer.Stop(); BuildSky(); };
            }
            if (Sky.Children.Count == 1 && Sky.Children[0] is Image)
            {
                var im = (Image)Sky.Children[0];
                im.Width = ActualWidth; im.Height = ActualHeight;
            }
            _skyTimer.Stop(); _skyTimer.Start();
        }

        // Градиент строится попиксельно: излом между опорными цветами сглаживается
        // усреднением соседних значений, а шум ±1 по каналам убирает полосы на тёмных тонах.
        Image MakeSkyGradient(double w, double h)
        {
            int pw = Math.Max(8, (int)w), ph = Math.Max(8, (int)h);
            double[][] stops =
            {
                new[] { 11.0, 7.0, 34.0 },   // #0B0722
                new[] { 7.0, 5.0, 18.0 },    // #070512 на 60%
                new[] { 5.0, 3.0, 12.0 }     // #05030C
            };
            Func<double, double[]> eval = t =>
            {
                t = Math.Max(0, Math.Min(1, t));
                double[] a, b; double k;
                if (t < 0.6) { a = stops[0]; b = stops[1]; k = t / 0.6; }
                else { a = stops[1]; b = stops[2]; k = (t - 0.6) / 0.4; }
                return new[] { a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k };
            };
            var px = new byte[pw * ph * 4];
            var rnd = new Random(7);
            for (int y = 0; y < ph; y++)
            {
                double t = (double)y / (ph - 1);
                double[] c0 = eval(t - 0.05), c1 = eval(t), c2 = eval(t + 0.05);
                double r = (c0[0] + c1[0] + c2[0]) / 3, g = (c0[1] + c1[1] + c2[1]) / 3, b = (c0[2] + c1[2] + c2[2]) / 3;
                int row = y * pw * 4;
                for (int x = 0; x < pw; x++)
                {
                    double n = rnd.NextDouble() * 2.4 - 1.2;
                    int i = row + x * 4;
                    px[i] = (byte)Math.Max(0, Math.Min(255, b + n));
                    px[i + 1] = (byte)Math.Max(0, Math.Min(255, g + n));
                    px[i + 2] = (byte)Math.Max(0, Math.Min(255, r + n));
                    px[i + 3] = 255;
                }
            }
            var wb = new WriteableBitmap(pw, ph, 96, 96, PixelFormats.Bgra32, null);
            wb.WritePixels(new Int32Rect(0, 0, pw, ph), px, pw * 4, 0);
            wb.Freeze();
            return new Image { Source = wb, Width = w, Height = h, Stretch = Stretch.Fill };
        }

        void AddAurora(Panel target, double x, double y, double size, string color)
        {
            var c = (Color)ColorConverter.ConvertFromString(color);
            var b = new RadialGradientBrush();
            b.GradientStops.Add(new GradientStop(Color.FromArgb(90, c.R, c.G, c.B), 0));
            b.GradientStops.Add(new GradientStop(Color.FromArgb(52, c.R, c.G, c.B), 0.35));
            b.GradientStops.Add(new GradientStop(Color.FromArgb(24, c.R, c.G, c.B), 0.6));
            b.GradientStops.Add(new GradientStop(Color.FromArgb(8, c.R, c.G, c.B), 0.82));
            b.GradientStops.Add(new GradientStop(Color.FromArgb(0, c.R, c.G, c.B), 1.0));
            var e = new Ellipse
            {
                Width = size, Height = size, Fill = b,
                Effect = new BlurEffect { Radius = 120, KernelType = KernelType.Gaussian }
            };
            Canvas.SetLeft(e, x); Canvas.SetTop(e, y);
            target.Children.Add(e);
        }

        void BuildLegend()
        {
            LegendItems.Children.Clear();
            LegendItems.Children.Add(LinksToggle());
            foreach (var kv in LinkColors)
            {
                var sp = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 14, 0) };
                sp.Children.Add(new Rectangle { Width = 16, Height = 3, RadiusX = 2, RadiusY = 2,
                    Fill = new SolidColorBrush(kv.Value), VerticalAlignment = VerticalAlignment.Center,
                    Margin = new Thickness(0, 1, 6, 0) });
                sp.Children.Add(new TextBlock { Text = kv.Key, FontSize = 12,
                    Foreground = (Brush)FindResource("DimBrush") });
                LegendItems.Children.Add(sp);
            }
        }

        /// <summary>Глаз в легенде: прячет нити с карты, не разрывая самих связей.</summary>
        FrameworkElement LinksToggle()
        {
            var eye = new TextBlock
            {
                FontFamily = new FontFamily("Segoe UI Emoji"), FontSize = 13,
                VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0)
            };
            var word = new TextBlock { Text = "нити", FontSize = 12, VerticalAlignment = VerticalAlignment.Center };
            var sp = new StackPanel { Orientation = Orientation.Horizontal, Cursor = Cursors.Hand,
                Margin = new Thickness(0, 0, 14, 0) };
            sp.Children.Add(eye); sp.Children.Add(word);

            var chip = new Border
            {
                Child = sp, CornerRadius = new CornerRadius(9), Padding = new Thickness(8, 2, 9, 3),
                Margin = new Thickness(0, 0, 12, 0), BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand, ToolTip = "Показать или спрятать нити между узлами"
            };

            Action paint = () =>
            {
                bool on = _settings.MapLinks;
                eye.Text = on ? "👁" : "🚫";
                word.Foreground = (Brush)FindResource(on ? "TextBrush" : "FaintBrush");
                chip.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString(on ? "#40251C52" : "#2214102E"));
                chip.BorderBrush = (Brush)FindResource(on ? "BorderBright" : "BorderBrush2");
            };
            paint();

            chip.MouseLeftButtonUp += (s, e) =>
            {
                _settings.MapLinks = !_settings.MapLinks;
                Store.SaveSettings(_settings);
                paint();
                Render();
                e.Handled = true;
            };
            return chip;
        }
    }
}
