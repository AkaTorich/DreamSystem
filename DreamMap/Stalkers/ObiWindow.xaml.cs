using System;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace DreamMap.Stalkers
{
    /* Оби — гадание йоруба. НЕ толкователь снов: сон у йоруба есть весть от ориша,
       предков или эгбе (духовных двойников), и Оби им не расшифровывают, а проверяют
       уже сложившуюся догадку — «правильно ли я тебя понял?».
       Бросают четыре доли ореха (или каури). Каждая падает лицом (эфун, светлая
       вогнутая сторона — «открыта») или изнанкой. Число «лиц» даёт одну из пяти фигур:
         2 — Èjì Ifé  (Эджифе)  — самый твёрдый ДА;
         3 — Ẹ̀tàwá  (Этава)   — «скорее да», бросить ещё для подтверждения;
         4 — Aláàfíà (Алафия)  — мир/благо, но ответ мягок — бросить ещё;
         1 — Ọ̀kànràn (Оканран) — НЕТ;
         0 — Òyèkú   (Ойеку)   — резкое НЕТ и знак, что сон нечист.
       Спрашивают утром, натощак, у порога Эшу-Элегба. Серьёзные и повторяющиеся сны
       Оби не доверяют — их несут к Ифа. */
    public partial class ObiWindow : Window
    {
        class Figure
        {
            public string Yo, Ru, Kind, Says;
            public Figure(string yo, string ru, string kind, string says)
            { Yo = yo; Ru = ru; Kind = kind; Says = says; }
        }

        // по числу «лиц» (открытых долей): индекс 0..4
        static readonly Figure[] ByFaces =
        {
            new Figure("Òyèkú", "0 лиц — резкое «нет»", "hardno",
                "ни одна доля не открылась: твёрдый отказ и дурной знак. Сон нечист."),
            new Figure("Ọ̀kànràn", "1 лицо — «нет»", "no",
                "одна доля открыта: догадка неверна, дверь закрыта."),
            new Figure("Èjì Ifé", "2 лица — «да»", "yes",
                "две доли лицом, две изнанкой — самый твёрдый «да». Ты понял верно."),
            new Figure("Ẹ̀tàwá", "3 лица — «скорее да»", "again",
                "три доли открыты: ответ склоняется к «да», но орех просит бросить ещё раз."),
            new Figure("Aláàfíà", "4 лица — мир, но мягко", "again",
                "все доли лицом: мир и благо, но ответ неполон — брось ещё, чтобы утвердить."),
        };

        readonly Random _rnd = new Random();
        int _castNo;

        public ObiWindow() : this(null) { }

        public ObiWindow(string dreamContext)
        {
            InitializeComponent();
            if (!string.IsNullOrWhiteSpace(dreamContext)) AboutBox.Text = dreamContext.Trim();
        }

        void Preset_Click(object sender, RoutedEventArgs e)
        {
            GuessBox.Text = (string)((Button)sender).Tag;
        }

        void Cast_Click(object sender, RoutedEventArgs e)
        {
            bool[] up = new bool[4];
            int faces = 0;
            for (int i = 0; i < 4; i++) { up[i] = _rnd.Next(2) == 0; if (up[i]) faces++; }
            DrawLobes(up);
            _castNo++;

            var f = ByFaces[faces];
            CastLine.Text = "БРОСОК №" + _castNo + "  ·  лиц: " + faces + " из 4";
            FigName.Text = f.Yo;
            FigRu.Text = f.Ru + " — " + f.Says;
            var accent = f.Kind == "yes" ? "#FFFFFF"
                : f.Kind == "again" ? "#E8E8E8"
                : "#888888";                       // «нет» и «нечисто» — цвет осун-красный
            FigName.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(accent));

            string about = AboutBox.Text.Trim();
            string guess = GuessBox.Text.Trim();
            var t = new StringBuilder();

            t.Append("Оби спрашивают не о смысле сна, а о догадке. ");
            if (guess.Length > 0)
                t.Append("Ты кладёшь орех у порога и спрашиваешь: «").Append(guess).Append("».");
            else
                t.Append("Впиши догадку — что именно ты хочешь подтвердить у ореха.");
            if (about.Length > 0)
                t.Append(" Сон — о том, что «").Append(about).Append("».");
            t.Append("\n\n");

            t.Append("БРОСОК. Четыре доли ореха легли: ").Append(faces)
             .Append(faces == 1 ? " лицом (эфун) и " : " лицами (эфун) и ")
             .Append(4 - faces).Append(4 - faces == 1 ? " изнанкой." : " изнанками.")
             .Append(" Это фигура ").Append(f.Yo).Append(" — ").Append(f.Says).Append("\n\n");

            switch (f.Kind)
            {
                case "yes":
                    t.Append("ОТВЕТ: ДА. Эджифе — самый ясный знак согласия. ");
                    t.Append(guess.Length > 0
                        ? "Дух подтверждает: «" + guess + "» — верно."
                        : "Дух подтверждает догадку.");
                    t.Append(" Долг словами не гаси: поблагодари Эшу и день, что говорил.");
                    break;
                case "again":
                    t.Append("ОТВЕТ: СКОРЕЕ ДА, но неокончательно. ");
                    t.Append(f.Yo == "Aláàfíà"
                        ? "Алафия — мир и благоволение, но ответ мягок: орех просит утверждения."
                        : "Этава клонится к «да», но одного броска мало.");
                    t.Append(" Брось ещё раз: если выпадет Эджифе или снова доброе — подтверждено; ")
                     .Append("если ляжет Оканран или Ойеку — знак отзывается.");
                    break;
                case "no":
                    t.Append("ОТВЕТ: НЕТ. Оканран закрывает дверь: догадка неверна. ");
                    t.Append("Не настаивай — перебери другое предположение об источнике сна ")
                     .Append("(ориша — божество-покровитель, предки, эгбе — небесные двойники души, ")
                     .Append("или козни аджогун) и спроси заново.");
                    break;
                case "hardno":
                    t.Append("ОТВЕТ: НЕТ, и резко. Ойеку — не просто отказ: он знак, что сон НЕЧИСТ. ");
                    t.Append("Такой сон не пересказывают вслух. Соверши очищение у порога Эшу-Элегба, ")
                     .Append("омой лицо, и лишь потом спрашивай снова.");
                    break;
            }
            t.Append("\n\n");

            t.Append("КАК ЧИТАЛИ ЙОРУБА. Спрашивают утром, натощак, у порога или перед святыней ")
             .Append("Эшу-Элегба — привратника, через которого проходят и сны, и ответы. Оби даёт лишь ")
             .Append("«да/нет»: сам смысл сна (вода — Йемоджа или Ошун, огонь и железо — Огун или Шанго) ")
             .Append("подсказывает жрец и предание, а орех только подтверждает или отвергает догадку. ")
             .Append("Серьёзные и повторяющиеся сны Оби не доверяют — их несут к Ифа, где выпавший одун ")
             .Append("даёт эсе, стих, в котором сон обретает полный сюжет и предписание.");

            Reading.Text = t.ToString();
        }

        // рисуем четыре доли ореха: лицо — светлый эфун с охряным ободком, изнанка — тёмная
        void DrawLobes(bool[] up)
        {
            Lobes.Children.Clear();
            var efun = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E8E8E8"));
            var back = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#1A1A1A"));
            var rim = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#C8C8C8"));
            var vein = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#888888"));
            for (int i = 0; i < up.Length; i++)
            {
                var col = new StackPanel { Margin = new Thickness(0, 0, 12, 0) };
                var grid = new Grid { Width = 52, Height = 68 };
                grid.Children.Add(new Ellipse
                {
                    Width = 52, Height = 68,
                    Fill = up[i] ? efun : back,
                    Stroke = rim, StrokeThickness = up[i] ? 2 : 1.2
                });
                if (up[i])   // на лице — жилка доли ореха
                    grid.Children.Add(new System.Windows.Shapes.Line
                    {
                        X1 = 26, Y1 = 12, X2 = 26, Y2 = 56,
                        Stroke = vein, StrokeThickness = 1.5,
                        HorizontalAlignment = HorizontalAlignment.Center
                    });
                col.Children.Add(grid);
                col.Children.Add(new TextBlock
                {
                    Text = up[i] ? "лицо" : "изнанка",
                    Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(
                        up[i] ? "#C8C8C8" : "#666666")),
                    FontSize = 10.5, HorizontalAlignment = HorizontalAlignment.Center,
                    Margin = new Thickness(0, 4, 0, 0)
                });
                Lobes.Children.Add(col);
            }
        }

        void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed) DragMove();
        }
        void Minimize_Click(object sender, RoutedEventArgs e) { WindowState = WindowState.Minimized; }
        void Close_Click(object sender, RoutedEventArgs e) { Close(); }
    }
}
