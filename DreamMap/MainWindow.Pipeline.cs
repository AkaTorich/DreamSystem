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
        /* ================= конвейер ================= */
        void SetStep(TextBlock icon, TextBlock text, string state)
        {
            Brush dim = (Brush)FindResource("FaintBrush");
            switch (state)
            {
                case "run":
                    icon.Text = "◌"; icon.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#A78BFA"));
                    text.Foreground = (Brush)FindResource("TextBrush"); break;
                case "done":
                    icon.Text = "✦"; icon.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FD8B8"));
                    text.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FD8B8")); break;
                case "err":
                    icon.Text = "✕"; icon.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F87171"));
                    text.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F87171")); break;
                default:
                    icon.Text = "◇"; icon.Foreground = dim; text.Foreground = dim; break;
            }
        }

        /* ===== ИИ через сайт: ключ хранится только на сервере ===== */

        static List<string> ToStrings(Newtonsoft.Json.Linq.JToken t)
        {
            var r = new List<string>();
            var a = t as Newtonsoft.Json.Linq.JArray;
            if (a != null) foreach (var x in a) r.Add(x.ToString());
            return r;
        }

        async Task<Analysis> SiteAnalyze(Dream d)
        {
            var j = await _site.PostJson("ai_analyze", new { text = d.Text });
            var o = (Newtonsoft.Json.Linq.JObject)j["analysis"];
            d.ImagePrompt = (string)o["image_prompt"] ?? "";
            return new Analysis
            {
                Summary = (string)o["summary"] ?? "",
                Location = ShortLoc((string)o["location"]),
                Characters = ToStrings(o["characters"]),
                Emotions = ToStrings(o["emotions"]),
                Symbols = ToStrings(o["symbols"]),
                Motifs = ToStrings(o["motifs"])
            };
        }

        async Task<string> SiteGenImage(Dream d)
        {
            var j = await _site.PostJson("ai_image", new { prompt = d.ImagePrompt });
            byte[] raw = Convert.FromBase64String((string)j["image"]);
            string file = Store.RandName("jpg");   // только хеш и расширение
            System.IO.File.WriteAllBytes(System.IO.Path.Combine(Store.ImagesDir, file), raw);
            return file;
        }

        async Task<List<Link>> SiteLinks(Dream d)
        {
            var others = _dreams.Where(x => x.Id != d.Id && x.Analysis != null).Select(x => (object)new
            {
                id = x.Id, title = x.Title, summary = x.Analysis.Summary, location = x.Analysis.Location,
                characters = x.Analysis.Characters, emotions = x.Analysis.Emotions,
                symbols = x.Analysis.Symbols, motifs = x.Analysis.Motifs
            }).ToList();
            if (others.Count == 0) return new List<Link>();
            var j = await _site.PostJson("ai_links", new
            {
                dream = new
                {
                    title = d.Title, summary = d.Analysis.Summary, location = d.Analysis.Location,
                    characters = d.Analysis.Characters, emotions = d.Analysis.Emotions,
                    symbols = d.Analysis.Symbols, motifs = d.Analysis.Motifs
                },
                others = others
            });
            var res = new List<Link>();
            foreach (Newtonsoft.Json.Linq.JObject l in (Newtonsoft.Json.Linq.JArray)j["links"])
                res.Add(new Link { Id = (string)l["id"], Type = (string)l["type"], Reason = (string)l["reason"] ?? "" });
            return res;
        }

        async Task Pipeline(Dream d, string forcedLoc = null)
        {
            SetStep(P1Icon, P1Text, ""); SetStep(P2Icon, P2Text, ""); SetStep(P3Icon, P3Text, "");
            ProgClose.Visibility = Visibility.Collapsed;
            ProgOverlay.Visibility = Visibility.Visible;
            bool hadErr = false;

            if (d.Analysis == null)
            {
                SetStep(P1Icon, P1Text, "run");
                try { d.Analysis = await SiteAnalyze(d); SetStep(P1Icon, P1Text, "done"); }
                catch (Exception ex) { SetStep(P1Icon, P1Text, "err"); hadErr = true; Toast("Анализ: " + ex.Message); }
            }
            else SetStep(P1Icon, P1Text, "done");

            // пользователь выбрал прежнюю локацию: закрепляем её и наследуем её картину
            if (!string.IsNullOrEmpty(forcedLoc) && d.Analysis != null)
            {
                d.Analysis.Location = forcedLoc;
                if (string.IsNullOrEmpty(d.ImageFile))
                {
                    var donor = _dreams.FirstOrDefault(x => x.Id != d.Id && x.Analysis != null &&
                        string.Equals(x.Analysis.Location.Trim(), forcedLoc, StringComparison.OrdinalIgnoreCase) &&
                        Store.ImagePath(x) != null);
                    if (donor != null) d.ImageFile = donor.ImageFile;
                }
            }

            if (string.IsNullOrEmpty(d.ImageFile) && !string.IsNullOrEmpty(d.ImagePrompt))
            {
                string choice = _settings.GenImages ? "gen" : await AskImageChoice(d);
                if (choice == "gen")
                {
                    SetStep(P2Icon, P2Text, "run");
                    try { d.ImageFile = await SiteGenImage(d); SetStep(P2Icon, P2Text, "done"); }
                    catch (Exception ex) { SetStep(P2Icon, P2Text, "err"); hadErr = true; Toast("Картинка: " + ex.Message); }
                }
                else if (choice.StartsWith("file:"))
                {
                    d.ImageFile = choice.Substring(5);
                    SetStep(P2Icon, P2Text, "done");
                }
            }
            else SetStep(P2Icon, P2Text, string.IsNullOrEmpty(d.ImageFile) ? "" : "done");

            if (d.Analysis != null)
            {
                SetStep(P3Icon, P3Text, "run");
                try { d.Links = await SiteLinks(d); SetStep(P3Icon, P3Text, "done"); }
                catch (Exception ex) { SetStep(P3Icon, P3Text, "err"); hadErr = true; Toast("Связи: " + ex.Message); }
            }

            // сны с одной локацией всегда соединены в сеть, даже если модель связь не нашла
            if (d.Analysis != null && !string.IsNullOrWhiteSpace(d.Analysis.Location))
            {
                if (d.Links == null) d.Links = new List<Link>();
                foreach (var o in _dreams)
                {
                    if (o.Id == d.Id || o.Analysis == null ||
                        !string.Equals(o.Analysis.Location.Trim(), d.Analysis.Location.Trim(),
                            StringComparison.OrdinalIgnoreCase)) continue;
                    bool already = d.Links.Any(l => l.Id == o.Id && l.Type == "локация") ||
                        (o.Links != null && o.Links.Any(l => l.Id == d.Id && l.Type == "локация"));
                    if (!already)
                        d.Links.Add(new Link { Id = o.Id, Type = "локация",
                            Reason = "та же локация — " + d.Analysis.Location });
                }
            }

            Store.SaveDreams(_dreams);
            RebuildGraph();
            RenderList();

            if (hadErr) ProgClose.Visibility = Visibility.Visible;
            else
            {
                await Task.Delay(700);
                ProgOverlay.Visibility = Visibility.Collapsed;
            }
        }

        /* ================= выбор картинки ================= */
        System.Threading.Tasks.TaskCompletionSource<string> _imgChoice;

        Task<string> AskImageChoice(Dream d)
        {
            ImgLocText.Text = d.Analysis != null && !string.IsNullOrEmpty(d.Analysis.Location)
                ? "Локация сна: " + d.Analysis.Location +
                  ". Нарисовать её заново, взять картину из прежнего сна или обойтись без картинки?"
                : "Нарисовать локацию, взять картину из прежнего сна или обойтись без картинки?";

            ImgGallery.Children.Clear();
            var used = new HashSet<string>();
            foreach (var o in _dreams)
            {
                if (o.Id == d.Id || string.IsNullOrEmpty(o.ImageFile) || !used.Add(o.ImageFile)) continue;
                string path = Store.ImagePath(o);
                if (path == null) continue;
                var bi = new BitmapImage();
                bi.BeginInit(); bi.CacheOption = BitmapCacheOption.OnLoad;
                bi.DecodePixelWidth = 300; bi.UriSource = new Uri(path); bi.EndInit(); bi.Freeze();

                var item = new StackPanel { Width = 168, Margin = new Thickness(0, 0, 10, 10), Cursor = Cursors.Hand };
                var pic = new Border
                {
                    Height = 108, CornerRadius = new CornerRadius(12),
                    Background = new ImageBrush(bi) { Stretch = Stretch.UniformToFill },
                    BorderBrush = (Brush)FindResource("BorderBrush2"), BorderThickness = new Thickness(1)
                };
                item.Children.Add(pic);
                item.Children.Add(new TextBlock
                {
                    Text = o.Analysis != null && !string.IsNullOrEmpty(o.Analysis.Location) ? o.Analysis.Location : o.Title,
                    FontSize = 11.5, TextWrapping = TextWrapping.Wrap, MaxHeight = 46,
                    Foreground = (Brush)FindResource("DimBrush"), Margin = new Thickness(2, 4, 0, 0)
                });
                string file = o.ImageFile;
                item.MouseLeftButtonUp += (s, e) => { if (_imgChoice != null) _imgChoice.TrySetResult("file:" + file); };
                item.MouseEnter += (s, e) => pic.BorderBrush = (Brush)FindResource("BorderBright");
                item.MouseLeave += (s, e) => pic.BorderBrush = (Brush)FindResource("BorderBrush2");
                ImgGallery.Children.Add(item);
            }
            if (ImgGallery.Children.Count == 0)
                ImgGallery.Children.Add(new TextBlock
                {
                    Text = "Прежних картин пока нет — можно нарисовать первую или обойтись без картинки.",
                    Foreground = (Brush)FindResource("FaintBrush"), FontSize = 12.5, TextWrapping = TextWrapping.Wrap
                });

            _imgChoice = new System.Threading.Tasks.TaskCompletionSource<string>();
            ImgOverlay.Visibility = Visibility.Visible;
            return _imgChoice.Task.ContinueWith(t =>
            {
                Dispatcher.Invoke(() => ImgOverlay.Visibility = Visibility.Collapsed);
                return t.Result;
            });
        }

        void ImgGen_Click(object sender, RoutedEventArgs e) { if (_imgChoice != null) _imgChoice.TrySetResult("gen"); }
        void ImgNone_Click(object sender, RoutedEventArgs e) { if (_imgChoice != null) _imgChoice.TrySetResult("none"); }
    }
}
