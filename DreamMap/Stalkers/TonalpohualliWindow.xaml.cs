using System;
using System.Globalization;
using System.Text;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace DreamMap.Stalkers
{
    /* Тональпоуалли — счёт 260 дней: 20 знаков × 13 чисел.
       Сон толкуется не по образу, а по пересечению образа с днём, в который он приснился.
       Опора счёта — корреляция Альфонсо Касо: 13 августа 1521 года (юлианский календарь,
       падение Теночтитлана) = день «1 Коатль». В пролептическом григорианском — 23.08.1521. */
    public partial class TonalpohualliWindow : Window
    {
        static readonly DateTime Anchor = new DateTime(1521, 8, 23);
        const int AnchorSign = 4;    // Коатль — пятый знак (0-based)
        const int AnchorPos = 104;   // его место в 260-дневном круге

        class Sign
        {
            public string Nahuatl, Ru, God, Does, Says, Deed;
            public Sign(string n, string r, string g, string d, string s, string dd)
            { Nahuatl = n; Ru = r; God = g; Does = d; Says = s; Deed = dd; }
        }

        static readonly Sign[] Signs =
        {
            new Sign("Cipactli", "Крокодил", "Тонакатекутли, податель пищи", "укореняет",
                "начало, земля, что примет любой посев", "заложи начатое — день держит корни"),
            new Sign("Ehecatl", "Ветер", "Кецалькоатль, дыхание", "разносит",
                "весть, дыхание, непостоянство", "скажи вслух то, что скрывал: ветру нужно движение"),
            new Sign("Calli", "Дом", "Тепейольотль, сердце горы", "замыкает внутрь",
                "покой, память, скрытое", "останься дома, не решай ничего снаружи"),
            new Sign("Cuetzpalin", "Ящерица", "Уэуэкойотль, старый койот", "торопит",
                "плоть, обновление, проворство", "действуй быстро и не оглядывайся"),
            new Sign("Coatl", "Змея", "Чальчиутликуэ, та, что в нефритовой юбке", "испытывает",
                "путь, сила, скрытая угроза", "проверь, кто рядом: день обнажает жало"),
            new Sign("Miquiztli", "Череп", "Теккистекатль, лунный", "останавливает",
                "предел, предки, отпускание", "отпусти отжившее, помяни ушедших"),
            new Sign("Mazatl", "Олень", "Тлалок, дождь", "уводит в чащу",
                "робость, бегство, лесная тропа", "не гонись — сегодня уместно уступить"),
            new Sign("Tochtli", "Кролик", "Майяуэль, хмельная", "умножает",
                "изобилие, хмель, чрезмерность", "знай меру: день множит и доброе, и лишнее"),
            new Sign("Atl", "Вода", "Шиутекутли, владыка огня", "омывает",
                "очищение, слёзы, переменчивость", "омойся и смени воду в доме"),
            new Sign("Itzcuintli", "Собака", "Миктлантекутли, владыка мёртвых", "ведёт через тьму",
                "проводник, верность, переход", "доверься тому, кто уже ходил этой дорогой"),
            new Sign("Ozomatli", "Обезьяна", "Шочипилли, князь цветов", "играет",
                "искусство, шутка, несерьёзность", "не принимай увиденное всерьёз — обрати в песню"),
            new Sign("Malinalli", "Трава", "Патекатль, целитель", "сплетает",
                "упорство, живучесть, путы", "распутай узел, пока он не врос"),
            new Sign("Acatl", "Тростник", "Тескатлипока, дымящееся зеркало", "пронзает",
                "прямота, суд, пустота внутри", "говори правду — день не терпит полого"),
            new Sign("Ocelotl", "Ягуар", "Тласольтеотль, пожирательница скверны", "крадётся",
                "ночь, охота, тайный грех", "признайся в тайном — иначе оно выйдет само"),
            new Sign("Cuauhtli", "Орёл", "Шипе-Тотек, наш владыка с содранной кожей", "поднимает",
                "высота, зоркость, битва", "взгляни сверху и решайся на бой"),
            new Sign("Cozcacuauhtli", "Гриф", "Ицпапалотль, обсидиановая бабочка", "доедает",
                "долголетие, итог, мудрая старость", "доведи до конца давнее, не начинай нового"),
            new Sign("Ollin", "Движение", "Шолотль, близнец", "встряхивает",
                "землетрясение, перемена, поворот", "готовься к повороту — он уже начался"),
            new Sign("Tecpatl", "Кремень", "Чальчиутотолин, нефритовый индюк", "рассекает",
                "нож, правда, отсечение", "отсеки лишнее одним движением"),
            new Sign("Quiahuitl", "Дождь", "Тонатиу, солнце", "обрушивает",
                "милость или кара сверху, внезапность", "жди внезапного и прими, как есть"),
            new Sign("Xochitl", "Цветок", "Шочикецаль, цветочное перо", "расцветает",
                "любовь, красота, краткость", "порадуйся — но помни, что цвет недолог"),
        };

        static readonly string[] NightLords =
        {
            "Шиутекутли — огонь очага", "Ицтли — обсидиановый нож", "Пильцинтекутли — юное солнце",
            "Синтеотль — маис", "Миктлантекутли — владыка мёртвых", "Чальчиутликуэ — вода",
            "Тласольтеотль — пожирательница скверны", "Тепейольотль — сердце горы", "Тлалок — дождь",
        };

        static readonly string[] Dirs =
        { "Восток — красная сторона, дом рассвета", "Север — чёрная сторона, страна мёртвых",
          "Запад — белая сторона, дом женщин", "Юг — синяя сторона, левая рука мира" };

        static readonly string[] Force =
        { "", "зачин, едва слышный голос", "двойственность, день колеблется",
          "опора, но ещё шаткая", "четыре стороны сошлись — ровная сила",
          "полнота середины", "созревание", "мера человека, счастливое число",
          "избыток, который тяготит", "тьма подступает", "сила без узды",
          "перелом, дальше — вниз", "почти предел", "предельная полнота: столько силы, что она опасна" };

        public TonalpohualliWindow() : this(null, null) { }

        public TonalpohualliWindow(DateTime? dreamDate, string image)
        {
            InitializeComponent();
            DateBox.Text = (dreamDate ?? DateTime.Today).ToString("yyyy-MM-dd");
            if (!string.IsNullOrWhiteSpace(image)) SignBox.Text = image.Trim();
            Ask_Click(null, null);
        }

        static int Mod(int a, int m) { int r = a % m; return r < 0 ? r + m : r; }

        void Ask_Click(object sender, RoutedEventArgs e)
        {
            DateTime d;
            if (!DateTime.TryParseExact(DateBox.Text.Trim(), "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out d))
            {
                Reading.Text = "День не разобран. Впиши его как ГГГГ-ММ-ДД — например 2026-08-11.";
                return;
            }

            int days = (d.Date - Anchor).Days;
            int number = Mod(days, 13) + 1;              // 1…13
            int signIdx = Mod(AnchorSign + days, 20);    // знак дня
            int pos = Mod(AnchorPos + days, 260);        // место в круге 260
            var sign = Signs[signIdx];

            int treStart = days - (number - 1);          // тресена — «неделя» из 13 дней
            var treSign = Signs[Mod(AnchorSign + treStart, 20)];
            string nightLord = NightLords[Mod(pos, 9)];
            string dir = Dirs[signIdx % 4];

            NumBig.Text = number.ToString();
            DrawDots(number);
            SignName.Text = number + " " + sign.Nahuatl;
            SignRu.Text = number + " " + sign.Ru + "  ·  день " + (pos + 1) + " из 260";
            Meta.Text =
                "Покровитель знака: " + sign.God + "\n" +
                "Владыка ночи: " + nightLord + "\n" +
                "Сторона света: " + dir + "\n" +
                "Тресена (тринадцатидневье): начата днём 1 " + treSign.Nahuatl + " — " + treSign.Ru +
                ", её нрав правит всеми тринадцатью днями";

            string image = SignBox.Text.Trim();
            var t = new StringBuilder();
            t.Append("Сон, приснившийся в день ").Append(number).Append(' ').Append(sign.Nahuatl)
             .Append(" (").Append(sign.Ru).Append("), приходит с той стороны, где ")
             .Append(dir.ToLowerInvariant()).Append(". Говорит ").Append(sign.God)
             .Append("; за спящим в ту ночь смотрел ").Append(nightLord).Append(".\n\n");

            t.Append("СИЛА ЧИСЛА ").Append(number).Append(" — ").Append(Force[number]).Append(".\n");
            t.Append("ГОЛОС ДНЯ: день ").Append(sign.Does).Append(" всё, что в нём привиделось; его весть — ")
             .Append(sign.Says).Append(".\n\n");

            if (image.Length > 0)
            {
                t.Append("ОБРАЗ «").Append(image).Append("» в день ").Append(sign.Ru).Append(": ");
                t.Append("сам по себе он не значит ничего — день ").Append(sign.Does)
                 .Append(" его. ").Append(Cross(image, sign, number)).Append("\n\n");
            }
            else t.Append("Впиши образ из сна — и станет видно, что день с ним делает.\n\n");

            t.Append("ТРЕСЕНА: сон стоит на ").Append(number).Append("-м дне тринадцатидневья, начатого днём 1 ")
             .Append(treSign.Nahuatl).Append(". Его общий нрав — ").Append(treSign.Says)
             .Append("; он окрашивает и этот сон.\n\n");

            t.Append("ЧТО ДЕЛАТЬ: ").Append(sign.Deed).Append(". ")
             .Append("По обычаю толкование не оставляют словами: после дурного сна — окуривание копалом, ")
             .Append("омовение и малое подношение; после доброго — благодарность тому, кто говорил.");

            Reading.Text = t.ToString();
        }

        // пересечение образа и дня: сила числа решает, как строго день поступает с виденным
        static string Cross(string image, Sign sign, int number)
        {
            string strength = number <= 4
                ? "Число мало — весть слаба: это намёк, а не приговор, и сбудется наполовину."
                : number <= 9
                ? "Число крепкое — весть полная: увиденное сбывается в свой срок, без спешки."
                : number == 13
                ? "Число предельное — весть переполнена силой: сбудется скоро и чрезмерно, берегись."
                : "Число велико — весть тяжела: сбудется с избытком, и в этом её опасность.";
            return "Читай так: то, что день " + sign.Does + ", становится вестью о " + sign.Says +
                   ". " + strength;
        }

        void DrawDots(int n)
        {
            Dots.Items.Clear();
            for (int i = 0; i < n; i++)
                Dots.Items.Add(new Ellipse
                {
                    Width = 12, Height = 12, Margin = new Thickness(2),
                    Fill = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#45E0C8")),
                    Stroke = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#F2B33D")),
                    StrokeThickness = 1
                });
        }

        void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ButtonState == MouseButtonState.Pressed) DragMove();
        }
        void Minimize_Click(object sender, RoutedEventArgs e) { WindowState = WindowState.Minimized; }
        void Close_Click(object sender, RoutedEventArgs e) { Close(); }
    }
}
