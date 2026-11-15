using System;
using System.Globalization;
using System.Text;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace DreamMap.Stalkers
{
    /* Цитэ — гадание майя. Две опоры:
       1) цолькин: 260 дней (20 имён × 13 чисел), день сна даёт науаль — дух-двойника;
       2) горсть красных семян цитэ, разложенная ПО ЧЕТЫРЕ: число кучек уводит счёт вперёд
          по цолькину, остаток говорит, каков ответ. Так гадали Шпийакок и Шмукане в «Пополь-Вух».
       Счёт дней — по корреляции GMT (584283): 0.0.0.0.0 = 4 Ахав 8 Кумк'у. */
    public partial class TziteWindow : Window
    {
        static readonly DateTime MjdEpoch = new DateTime(1858, 11, 17);

        class Day
        {
            public string Maya, Ru, Says;
            public Day(string m, string r, string s) { Maya = m; Ru = r; Says = s; }
        }

        static readonly Day[] Days =
        {
            new Day("Imix", "водяная лилия, крокодил", "исток, сырое начало, то, что ещё без формы"),
            new Day("Ik'", "ветер, дыхание", "дыхание и слово, дух, переменчивость"),
            new Day("Ak'b'al", "ночь, дом тьмы", "скрытое, утроба, сон внутри сна"),
            new Day("K'an", "зерно, сеть", "зрелость, изобилие, собранный урожай"),
            new Day("Chikchan", "небесный змей", "сила в крови, страсть, знание, что жалит"),
            new Day("Kimi", "смерть", "предки, конец и передышка, долг ушедшим"),
            new Day("Manik'", "олень, ладонь", "хватка, дар, рука, что берёт и отдаёт"),
            new Day("Lamat", "звезда, кролик", "Венера, изобилие с хмелем, избыток"),
            new Day("Muluk", "вода, нефрит", "жертва, дождь, плата за просимое"),
            new Day("Ok", "пёс", "верность и проводник через тьму"),
            new Day("Chuwen", "обезьяна", "мастер и ткач дней, игра, ремесло"),
            new Day("Eb'", "дорога, роса", "путь и судьба, лестница вниз или вверх"),
            new Day("B'en", "тростник", "рост, опора дома, прямая сила"),
            new Day("Ix", "ягуар", "земля и волшба, жреческая тайна, ночная зоркость"),
            new Day("Men", "орёл", "зоркость, работа, взгляд с высоты"),
            new Day("Kib'", "свеча, воск", "предки и долг, прощение, тихий свет"),
            new Day("Kab'an", "земля", "мысль и движение, дрожь, поворот"),
            new Day("Etz'nab'", "обсидиановый нож", "рассечение, правда без жалости"),
            new Day("Kawak", "буря", "гром, очищение силой, внезапное обновление"),
            new Day("Ajaw", "владыка, солнце", "свет и полнота, цель, завершение"),
        };

        static readonly string[] Remainder =
        {
            "Ровно, без остатка — дело сложилось само; ни прибавить, ни убавить.",
            "Один в остатке — весть о тебе одном: решать придётся без помощников.",
            "Двое в остатке — в деле двое, и они спорят; ответ надвое.",
            "Трое в остатке — дело двинется, но чужими руками; жди третьего.",
        };

        readonly Random _rnd = new Random();

        public TziteWindow() : this(null, null) { }

        public TziteWindow(DateTime? dreamDate, string question)
        {
            InitializeComponent();
            DateBox.Text = (dreamDate ?? DateTime.Today).ToString("yyyy-MM-dd");
            if (!string.IsNullOrWhiteSpace(question)) AskBox.Text = question.Trim();
            ShowDay();
        }

        static int Mod(int a, int m) { int r = a % m; return r < 0 ? r + m : r; }

        static int Jdn(DateTime d) { return (d.Date - MjdEpoch).Days + 2400001; }

        // цолькин по корреляции GMT: число 1..13 и имя дня 0..19 (0 = Imix)
        static void Tzolkin(int jdn, out int num, out int idx)
        {
            num = Mod(jdn + 5, 13) + 1;
            idx = Mod(jdn + 16, 20);
        }

        bool ReadDate(out DateTime d)
        {
            return DateTime.TryParseExact(DateBox.Text.Trim(), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out d);
        }

        void ShowDay()
        {
            DateTime d;
            if (!ReadDate(out d))
            {
                DayName.Text = "—";
                DayRu.Text = "день не разобран: впиши ГГГГ-ММ-ДД";
                return;
            }
            int n, i;
            Tzolkin(Jdn(d), out n, out i);
            DayName.Text = n + " " + Days[i].Maya;
            DayRu.Text = Days[i].Ru + "\nнауаль сна: " + Days[i].Says;
        }

        void Cast_Click(object sender, RoutedEventArgs e)
        {
            DateTime d;
            if (!ReadDate(out d))
            {
                Reading.Text = "День не разобран. Впиши его как ГГГГ-ММ-ДД — например 2026-08-11.";
                return;
            }
            ShowDay();

            int hand = _rnd.Next(28, 73);      // горсть: сколько семян легло в ладонь
            int piles = hand / 4;              // раскладка по четыре
            int rest = hand % 4;
            DrawSeeds(hand);

            int startN, startI;
            Tzolkin(Jdn(d), out startN, out startI);
            int ansJdn = Jdn(d) + piles;       // счёт идёт вперёд на число кучек
            int an, ai;
            Tzolkin(ansJdn, out an, out ai);

            HandLine.Text = "ГОРСТЬ: " + hand + " семян  ·  кучек по четыре: " + piles +
                            "  ·  в остатке: " + rest;
            AnsName.Text = an + " " + Days[ai].Maya;
            AnsRu.Text = Days[ai].Ru + "\n" + Days[ai].Says;

            string ask = AskBox.Text.Trim();
            var t = new StringBuilder();
            t.Append("Сон приснился в день ").Append(startN).Append(' ').Append(Days[startI].Maya)
             .Append(" — ").Append(Days[startI].Ru).Append(". Это его науаль: ")
             .Append(Days[startI].Says).Append(".\n\n");

            t.Append("СЕМЕНА. В ладонь легло ").Append(hand)
             .Append(" зёрен цитэ. Разложенные по четыре, они дали ").Append(piles)
             .Append(" кучек и ").Append(rest).Append(" в остатке. ")
             .Append(Remainder[rest]).Append("\n\n");

            t.Append("СЧЁТ. От дня сна счёт ушёл вперёд на ").Append(piles)
             .Append(" дней и замер на дне ").Append(an).Append(' ').Append(Days[ai].Maya)
             .Append(" — ").Append(Days[ai].Ru).Append(". Этот день и отвечает.\n\n");

            if (ask.Length > 0)
                t.Append("НА ВОПРОС «").Append(ask).Append("»: ").Append(Verdict(an, ai, rest)).Append("\n\n");
            else
                t.Append("ОТВЕТ ДНЯ: ").Append(Verdict(an, ai, rest)).Append("\n\n");

            t.Append("СИЛА ЧИСЛА ").Append(an).Append(": ").Append(NumWord(an)).Append("\n");
            t.Append("Хранитель дней не оставляет ответ словами: зажги свечу по цвету стороны, ")
             .Append("поблагодари день, что говорил, и отдай долг предкам — иначе счёт вернётся тем же вопросом.");

            Reading.Text = t.ToString();
        }

        string Verdict(int num, int idx, int rest)
        {
            string voice = "день " + Days[idx].Maya + " говорит о том, что " + Days[idx].Says;
            string tone = rest == 0
                ? "Ответ полный и без оговорок: сбудется так, как показано."
                : rest == 1
                ? "Ответ ложится на тебя одного: сбудется, если возьмёшься сам."
                : rest == 2
                ? "Ответ надвое: сбудется наполовину, и спор решит исход."
                : "Ответ придёт со стороны: сбудется чужими руками, дождись третьего.";
            string weight = num <= 4 ? "Число мало — голос тих, дело в зачатке."
                : num <= 9 ? "Число крепкое — дело идёт своим ходом."
                : "Число велико — дело набрало силу и торопится к развязке.";
            return voice + ". " + tone + " " + weight;
        }

        static string NumWord(int n)
        {
            switch (n)
            {
                case 1: return "единица — семя, начало без опоры";
                case 2: return "двойка — пара и спор";
                case 3: return "тройка — очаг, три камня под котлом";
                case 4: return "четвёрка — четыре стороны, полная опора";
                case 5: return "пятёрка — середина ладони, мера";
                case 6: return "шестёрка — течение, дело в пути";
                case 7: return "семёрка — ось мира, равновесие";
                case 8: return "восьмёрка — согласие, лад";
                case 9: return "девятка — девять слоёв подземного мира, глубина";
                case 10: return "десятка — воля предков, твёрдость";
                case 11: return "одиннадцать — излом, лишнее";
                case 12: return "двенадцать — свод почти замкнут";
                default: return "тринадцать — тринадцать небес, предельная полнота";
            }
        }

        void DrawSeeds(int n)
        {
            Seeds.Items.Clear();
            var fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#E34234"));
            var edge = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#7A1F17"));
            var rest = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2FD6A6"));
            int piles = n / 4;
            for (int p = 0; p < piles; p++)
            {
                var pile = new System.Windows.Controls.StackPanel
                {
                    Orientation = System.Windows.Controls.Orientation.Horizontal,
                    Margin = new Thickness(0, 0, 12, 8)
                };
                for (int k = 0; k < 4; k++)
                    pile.Children.Add(new Ellipse
                    {
                        Width = 11, Height = 11, Margin = new Thickness(1),
                        Fill = fill, Stroke = edge, StrokeThickness = 1
                    });
                Seeds.Items.Add(pile);
            }
            // остаток — нефритом: он и говорит, каков ответ
            int r = n % 4;
            if (r > 0)
            {
                var tail = new System.Windows.Controls.StackPanel
                {
                    Orientation = System.Windows.Controls.Orientation.Horizontal,
                    Margin = new Thickness(0, 0, 12, 8)
                };
                for (int k = 0; k < r; k++)
                    tail.Children.Add(new Ellipse
                    {
                        Width = 11, Height = 11, Margin = new Thickness(1),
                        Fill = rest, Stroke = edge, StrokeThickness = 1
                    });
                Seeds.Items.Add(tail);
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
