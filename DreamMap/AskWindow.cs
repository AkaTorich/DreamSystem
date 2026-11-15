using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;

namespace DreamMap
{
    // Своё окно вопроса вместо серого системного InputBox:
    // тёмное, со звёздным духом программы. AskWindow.Text(...) → строка или null.
    public static class AskWindow
    {
        public static string Text(Window owner, string title, string label,
            string initial = "", bool password = false)
        {
            string result = null;

            var win = new Window
            {
                Owner = owner, WindowStartupLocation = WindowStartupLocation.CenterOwner,
                WindowStyle = WindowStyle.None, ResizeMode = ResizeMode.NoResize,
                AllowsTransparency = true, Background = Brushes.Transparent,
                SizeToContent = SizeToContent.Height, Width = 400,
                ShowInTaskbar = false, FontFamily = new FontFamily("Segoe UI")
            };

            var frame = new Border
            {
                CornerRadius = new CornerRadius(16), BorderThickness = new Thickness(1),
                BorderBrush = (Brush)Application.Current.FindResource("BorderBright"),
                Effect = new DropShadowEffect { BlurRadius = 30, ShadowDepth = 0, Opacity = .6 }
            };
            var bg = new LinearGradientBrush { StartPoint = new Point(0, 0), EndPoint = new Point(1, 1) };
            bg.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#F81C1540"), 0));
            bg.GradientStops.Add(new GradientStop((Color)ColorConverter.ConvertFromString("#FC0F0B24"), 1));
            frame.Background = bg;

            var stack = new StackPanel { Margin = new Thickness(22, 18, 22, 18) };
            stack.Children.Add(new TextBlock
            {
                Text = title, FontFamily = new FontFamily("Georgia"), FontSize = 18,
                Foreground = (Brush)Application.Current.FindResource("TextBrush")
            });
            stack.Children.Add(new TextBlock
            {
                Text = label, FontSize = 12.5, Margin = new Thickness(0, 10, 0, 6),
                TextWrapping = TextWrapping.Wrap,
                Foreground = (Brush)Application.Current.FindResource("DimBrush")
            });

            Control input;
            if (password)
            {
                var pb = new PasswordBox
                {
                    FontSize = 14, Padding = new Thickness(10, 7, 10, 7),
                    Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#33130E2E")),
                    Foreground = (Brush)Application.Current.FindResource("TextBrush"),
                    BorderBrush = (Brush)Application.Current.FindResource("BorderBrush2"),
                    CaretBrush = (Brush)Application.Current.FindResource("TextBrush")
                };
                pb.Password = initial;
                input = pb;
            }
            else
            {
                var tb = new TextBox { Style = (Style)Application.Current.FindResource("Input"),
                    Text = initial };
                input = tb;
            }
            stack.Children.Add(input);

            var row = new StackPanel
            {
                Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right,
                Margin = new Thickness(0, 16, 0, 0)
            };
            var cancel = new Button
            {
                Style = (Style)Application.Current.FindResource("Ghost"),
                Content = "Отмена", Margin = new Thickness(0, 0, 8, 0)
            };
            var ok = new Button
            {
                Style = (Style)Application.Current.FindResource("Primary"),
                Content = "Готово", MinWidth = 92, IsDefault = true
            };
            cancel.Click += (s, e) => win.Close();
            ok.Click += (s, e) =>
            {
                result = password ? ((PasswordBox)input).Password : ((TextBox)input).Text;
                win.Close();
            };
            row.Children.Add(cancel);
            row.Children.Add(ok);
            stack.Children.Add(row);

            frame.Child = stack;
            win.Content = frame;
            win.KeyDown += (s, e) => { if (e.Key == Key.Escape) win.Close(); };
            win.MouseLeftButtonDown += (s, e) => { try { win.DragMove(); } catch { } };
            win.Loaded += (s, e) =>
            {
                input.Focus();
                var tb = input as TextBox;
                if (tb != null) tb.SelectAll();
            };
            win.ShowDialog();
            return result;
        }
    }
}
