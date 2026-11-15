using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace DreamMap.Stalkers
{
    public partial class MediciWindow : Window
    {
        private const int DeckSize = 36;
        private const int GreetingLength = 3;

        private readonly List<Card> _allCards = new List<Card>();
        private readonly Dictionary<string, CardDescription> _cardDescriptions = new Dictionary<string, CardDescription>();
        private readonly ObservableCollection<Card> _finalStack = new ObservableCollection<Card>();
        private readonly ObservableCollection<Card> _hungStack = new ObservableCollection<Card>();
        private CancellationTokenSource _cts;
        private int _attemptCount;

        public MediciWindow()
        {
            InitializeComponent();
            InitializeDeck();
            InitializeCardDescriptions();
            InitializeCardButtons();
            finalStackList.ItemsSource = _finalStack;
            hungStackList.ItemsSource = _hungStack;
            Purpose_Changed(null, null);   // применить предназначение по умолчанию (программа к цели)
        }

        // ── правила цепочки ───────────────────────────────────────────────
        // Цепочка из 36 звеньев складывается так:
        //   [приветствие духа: 3] [проработка зависшего: k] [тело] [цель + результат]
        private class ChainRules
        {
            public bool Greeting;   // 1. первые три звена — мелкие быстрые события
            public bool Hung;       // 2. зависшее прорабатывается сразу за приветствием
            public bool Result;     // 3. результат дописывается в хвост цепочки
        }

        private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            DragMove();
        }

        private void Minimize_Click(object sender, RoutedEventArgs e)
        {
            WindowState = WindowState.Minimized;
        }

        private void Close_Click(object sender, RoutedEventArgs e)
        {
            Close();
        }

        private void InitializeDeck()
        {
            char[] suits = { 'ч', 'б', 'п', 'к' };
            for (int rank = 6; rank <= 14; rank++)
            {
                foreach (var suit in suits)
                {
                    _allCards.Add(new Card(rank, suit));
                }
            }
        }

        private void InitializeCardDescriptions()
        {
            // Единая схема мастей: черви — чувства и личное, бубны — деньги, вещи, обмен,
            // крести — дело, работа, обязательства, пики — воля, усилие, препятствие, неприятное.
            // Достоинство даёт стадию события, масть — сферу, в которой оно происходит.
            _cardDescriptions.Add("6ч", new CardDescription("6 черви — перемещение. Идёшь к близкому, на свидание."));
            _cardDescriptions.Add("6б", new CardDescription("6 бубны — перемещение. Идёшь в магазин, к банкомату."));
            _cardDescriptions.Add("6к", new CardDescription("6 крести — перемещение. Идёшь утром на работу."));
            _cardDescriptions.Add("6п", new CardDescription("6 пики — перемещение. Идёшь через силу: разбираться, к врачу."));

            _cardDescriptions.Add("7ч", new CardDescription("7 черви — поглощение. Сел завтракать в своё удовольствие."));
            _cardDescriptions.Add("7б", new CardDescription("7 бубны — поглощение. Пересчитал деньги, убрал покупку в сумку."));
            _cardDescriptions.Add("7к", new CardDescription("7 крести — поглощение. Взял книгу с полки, прочёл рабочую бумагу."));
            _cardDescriptions.Add("7п", new CardDescription("7 пики — поглощение. Узнал что-то неприятное, проглотил обиду."));

            _cardDescriptions.Add("8ч", new CardDescription("8 черви — общение. Болтаешь с приятным человеком."));
            _cardDescriptions.Add("8б", new CardDescription("8 бубны — общение. Общаешься с продавцом, торгуешься о цене."));
            _cardDescriptions.Add("8к", new CardDescription("8 крести — общение. Обсуждаешь деловые проблемы."));
            _cardDescriptions.Add("8п", new CardDescription("8 пики — общение. Разговор через силу: спор, выговор."));

            _cardDescriptions.Add("9ч", new CardDescription("9 черви — действие. Поступок по чувству: обнял или вспылил."));
            _cardDescriptions.Add("9б", new CardDescription("9 бубны — действие. Купил что-то, заплатил."));
            _cardDescriptions.Add("9к", new CardDescription("9 крести — действие. Сделал работу: починил, написал, сдал."));
            _cardDescriptions.Add("9п", new CardDescription("9 пики — действие. Пересилил себя, дал отпор."));

            _cardDescriptions.Add("10ч", new CardDescription("10 черви — результат. Рад, что всё завершилось; отпустило."));
            _cardDescriptions.Add("10б", new CardDescription("10 бубны — результат. Результат связан с деньгами."));
            _cardDescriptions.Add("10к", new CardDescription("10 крести — результат. Завершение работы, дело закрыто."));
            _cardDescriptions.Add("10п", new CardDescription("10 пики — результат. Тяжёлое позади, отмучился."));

            _cardDescriptions.Add("Вч", new CardDescription("Валет черви — курьер силы. Хочешь сблизиться, тянет к человеку."));
            _cardDescriptions.Add("Вб", new CardDescription("Валет бубны — курьер силы. Хочешь заработать, приглядел покупку."));
            _cardDescriptions.Add("Вк", new CardDescription("Валет крести — курьер силы. Хочешь выполнить работу, улучшить навык."));
            _cardDescriptions.Add("Вп", new CardDescription("Валет пики — курьер силы. Хочешь одолеть трудное, собраться с волей."));

            _cardDescriptions.Add("Дч", new CardDescription("Дама черви — персона. Близкий человек: друг, любимая."));
            _cardDescriptions.Add("Дб", new CardDescription("Дама бубны — персона. Человек денег: кассирша, продавец, клиент."));
            _cardDescriptions.Add("Дк", new CardDescription("Дама крести — персона. Человек по делу: коллега, водитель автобуса."));
            _cardDescriptions.Add("Дп", new CardDescription("Дама пики — персона. Тот, кто мешает: облаяла собака, придира."));

            _cardDescriptions.Add("Кч", new CardDescription("Король черви — закон. Закон чувств: нельзя предать, надо простить."));
            _cardDescriptions.Add("Кб", new CardDescription("Король бубны — закон. Нужно заплатить, вернуть долг."));
            _cardDescriptions.Add("Кк", new CardDescription("Король крести — закон. Порядок дела: необходимо пройти, явиться."));
            _cardDescriptions.Add("Кп", new CardDescription("Король пики — закон. Запрет, приговор: остановился у перехода."));

            _cardDescriptions.Add("Тч", new CardDescription("Туз черви — сила. Встреча или весть, что задела за живое."));
            _cardDescriptions.Add("Тб", new CardDescription("Туз бубны — сила. Деньги извне: премия, выигрыш в лотерею."));
            _cardDescriptions.Add("Тк", new CardDescription("Туз крести — сила. Вызов начальника, срочное дело свалилось."));
            _cardDescriptions.Add("Тп", new CardDescription("Туз пики — сила. Удар извне: поломка, болезнь, подметающая машина."));
        }

        private void InitializeCardButtons()
        {
            foreach (var card in _allCards)
                cardGrid.Children.Add(MakeCardFace(card));
        }

        // маленькая вертикальная карта: масть в цвете, номинал в углу и большой знак в центре
        private System.Windows.FrameworkElement MakeCardFace(Card card)
        {
            bool red = card.Suit == 'ч' || card.Suit == 'б';
            var ink = red
                ? new System.Windows.Media.SolidColorBrush(
                    (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#C6402F"))
                : new System.Windows.Media.SolidColorBrush(
                    (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#1A1414"));
            string suit;
            switch (card.Suit)
            {
                case 'ч': suit = "♥"; break; // ♥
                case 'б': suit = "♦"; break; // ♦
                case 'п': suit = "♠"; break; // ♠
                default: suit = "♣"; break;  // ♣ (крести)
            }
            string rank = RankLabel(card.Rank);

            var border = new Border
            {
                Width = 50,
                Height = 70,
                Margin = new Thickness(4),
                CornerRadius = new CornerRadius(5),
                Background = new System.Windows.Media.SolidColorBrush(
                    (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#F2ECDD")),
                BorderBrush = new System.Windows.Media.SolidColorBrush(
                    (System.Windows.Media.Color)System.Windows.Media.ColorConverter.ConvertFromString("#7A1C1C")),
                BorderThickness = new Thickness(1),
                Cursor = System.Windows.Input.Cursors.Hand,
                Tag = card,
                ToolTip = DescribeCard(card)
            };

            var g = new Grid();
            // номинал + масть в левом верхнем углу
            var corner = new StackPanel { HorizontalAlignment = HorizontalAlignment.Left,
                VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(4, 2, 0, 0) };
            corner.Children.Add(new TextBlock { Text = rank, Foreground = ink, FontSize = 12,
                FontWeight = FontWeights.Bold, FontFamily = new System.Windows.Media.FontFamily("Segoe UI"),
                HorizontalAlignment = HorizontalAlignment.Center });
            corner.Children.Add(new TextBlock { Text = suit, Foreground = ink, FontSize = 11,
                FontFamily = new System.Windows.Media.FontFamily("Segoe UI Symbol"),
                HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, -3, 0, 0) });
            g.Children.Add(corner);
            // большой знак масти по центру
            g.Children.Add(new TextBlock { Text = suit, Foreground = ink, FontSize = 26,
                FontFamily = new System.Windows.Media.FontFamily("Segoe UI Symbol"),
                HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 6, 0, 0) });

            border.Child = g;
            border.MouseLeftButtonUp += (s, e) => AddToFinal(((System.Windows.FrameworkElement)s).Tag as Card);
            border.MouseRightButtonUp += (s, e) => AddToHung(((System.Windows.FrameworkElement)s).Tag as Card);
            return border;
        }

        private static string RankLabel(int rank)
        {
            switch (rank)
            {
                case 11: return "В";
                case 12: return "Д";
                case 13: return "К";
                case 14: return "Т";
                default: return rank.ToString();
            }
        }

        // режим предназначения — от него зависит смысл карт (кроме исходного толкования)
        private enum PurposeMode { Goal, Reutov, Hung, Person, Day, Free }
        private PurposeMode _purposeMode = PurposeMode.Goal;

        private string DescribeCard(Card card)
        {
            // жадный алгоритм и «свободный» — исходное толкование первого алгоритма, не трогаем
            bool original = greedyRadio == null || greedyRadio.IsChecked == true
                || _purposeMode == PurposeMode.Free;
            if (original)
            {
                string key = card.ToString();
                return _cardDescriptions.ContainsKey(key) ? _cardDescriptions[key].Description : key;
            }
            return ComposedMeaning(card, _purposeMode);
        }

        // достоинство = стадия события (документировано методом), масть = сфера
        private static string RankStage(int rank)
        {
            switch (rank)
            {
                case 6: return "перемещение";
                case 7: return "поглощение";
                case 8: return "общение";
                case 9: return "действие";
                case 10: return "результат";
                case 11: return "курьер силы";
                case 12: return "персона";
                case 13: return "закон";
                default: return "сила";
            }
        }

        // единая схема мастей: черви — чувства и личное, бубны — деньги, вещи, обмен,
        // крести — дело, работа, обязательства, пики — воля, усилие, препятствие, неприятное
        private static string SuitSphere(char suit)
        {
            switch (suit)
            {
                case 'ч': return "чувства и личное";
                case 'б': return "деньги, вещи, обмен";
                case 'п': return "воля, усилие, препятствие";
                default: return "дело, работа, обязательства";
            }
        }

        // смысл карты через призму выбранного предназначения (на документированной
        // системе стадий и сфер; исходные толкования при этом остаются нетронуты)
        private static string ComposedMeaning(Card card, PurposeMode mode)
        {
            string stage = RankStage(card.Rank);
            string sphere = SuitSphere(card.Suit);
            string clause;
            switch (mode)
            {
                case PurposeMode.Goal: clause = RoyalClause(card.Rank); break;
                case PurposeMode.Reutov: clause = ReutovClause(card.Rank); break;
                case PurposeMode.Hung: clause = HungClause(card.Rank); break;
                case PurposeMode.Person: clause = PersonClause(card.Rank); break;
                default: clause = DayClause(card.Rank); break; // Day
            }
            return stage + " · " + sphere + ". " + clause;
        }

        // призма королевского побега: программа к спасению от казни, где королева — главное лицо
        private static string RoyalClause(int rank)
        {
            switch (rank)
            {
                case 6: return "Королева делает первый шаг к двери темницы — путь к побегу начат.";
                case 7: return "Прячет ключ и записку мага, вбирает подсказку — план входит в неё.";
                case 8: return "Шёпотом склоняет верного стража — слово отпирает засов.";
                case 9: return "Своей рукой снимает оковы, набрасывает плащ — действует сама.";
                case 10: return "Ворота позади — королева на свободе, казнь миновала.";
                case 11: return "Гонец мага приносит знак — где и когда бежать.";
                case 12: return "Сама королева — та, что ведёт свой побег (её образ).";
                case 13: return "Приговор, стража, засов — закон, что предстоит обойти.";
                default: return "Случай спасает — гроза, смена караула: внешняя сила даёт брешь.";
            }
        }

        // призма выигрыша: программа к удаче, как у Реутова с лотереей
        private static string ReutovClause(int rank)
        {
            switch (rank)
            {
                case 6: return "Выйти в удачный час — путь к выигрышу начат.";
                case 7: return "Взять билет, вложить малое — впитать шанс.";
                case 8: return "Слово при покупке — назвать, попросить удачу.";
                case 9: return "Само действие ставки — рука тянет счастливый номер.";
                case 10: return "Итог — деньги пришли, ставка сыграла.";
                case 11: return "Вестник удачи — знак, подсказка, где брать.";
                case 12: return "Тот, кто продал билет или принёс весть о выигрыше.";
                case 13: return "Правило розыгрыша — тираж, срок, условие.";
                default: return "Слепой случай — сама фортуна, внешняя сила выигрыша.";
            }
        }

        private static string HungClause(int rank)
        {
            switch (rank)
            {
                case 6: return "Застряло в начале пути — сделай первый мелкий шаг, и звено тронется.";
                case 7: return "Не усвоено, застряло непрожёванным — доверши, прими до конца.";
                case 8: return "Недоговорено — вырази вслух то, что зависло.";
                case 9: return "Не сделан поступок — соверши, разряди застой действием.";
                case 10: return "Нет завершения — доведи до конца и отметь итог.";
                case 11: return "Желание без хода — дай ему выход, начни.";
                case 12: return "Застряло на человеке — закрой с ним вопрос.";
                case 13: return "Упёрлось в правило или долг — исполни обязательство.";
                default: return "Внешняя сила держит — прими её и отпусти.";
            }
        }

        private static string PersonClause(int rank)
        {
            switch (rank)
            {
                case 6: return "Движение навстречу — путь к встрече начат.";
                case 7: return "Общая трапеза, принятие — сближение через общее.";
                case 8: return "Разговор — прямой контакт с человеком.";
                case 9: return "Совместное действие — сделали что-то вместе.";
                case 10: return "Встреча состоялась — контакт завершён.";
                case 11: return "Вестник, посредник — младший, кто сводит с человеком.";
                case 12: return "Сама персона — тот, к кому идёшь (женский образ).";
                case 13: return "Старший, значимый — влиятельный человек (мужской образ).";
                default: return "Случай сводит — встреча по внешней силе.";
            }
        }

        private static string DayClause(int rank)
        {
            switch (rank)
            {
                case 6: return "Переход, дорога — куда-то идёшь.";
                case 7: return "Еда, отдых, впитывание — берёшь в себя.";
                case 8: return "Разговор, встреча словом.";
                case 9: return "Поступок, дело руками.";
                case 10: return "Итог отрезка — что-то завершилось.";
                case 11: return "Порыв, желание — потянуло к чему-то.";
                case 12: return "Человек на пути — кого встретил.";
                case 13: return "Правило, необходимость — надо или нельзя.";
                default: return "Внешнее событие — что-то произошло само.";
            }
        }

        private static bool Same(Card a, Card b)
        {
            return a != null && b != null && a.Rank == b.Rank && a.Suit == b.Suit;
        }

        private void AddToFinal(Card selectedCard)
        {
            if (selectedCard == null) return;
            if (_finalStack.Any(c => Same(c, selectedCard)))
            {
                MessageBox.Show("Эта карта уже добавлена в конечную стопку!", "Предупреждение", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (_hungStack.Any(c => Same(c, selectedCard)))
            {
                MessageBox.Show("Эта карта отмечена как зависшее — уберите её оттуда.", "Предупреждение", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (_finalStack.Count >= DeckSize)
            {
                MessageBox.Show("Нельзя добавить более 36 карт в конечную стопку!", "Ошибка", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            _finalStack.Add(selectedCard);
        }

        private void AddToHung(Card selectedCard)
        {
            if (selectedCard == null) return;
            if (_hungStack.Any(c => Same(c, selectedCard)))
            {
                MessageBox.Show("Эта карта уже отмечена как зависшее!", "Предупреждение", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (_finalStack.Any(c => Same(c, selectedCard)))
            {
                MessageBox.Show("Эта карта стоит в цели — уберите её оттуда.", "Предупреждение", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            _hungStack.Add(selectedCard);
        }

        private void FinalStackList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            var card = finalStackList.SelectedItem as Card;
            if (card != null) _finalStack.Remove(card);
        }

        private void HungStackList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            var card = hungStackList.SelectedItem as Card;
            if (card != null) _hungStack.Remove(card);
        }

        private void Algorithm_Changed(object sender, RoutedEventArgs e)
        {
            // правила свёрток относятся только к перебору: жадный расчёт — другой инструмент
            if (rulesPanel == null || rulesHeader == null) return;
            bool rulesApply = backtrackRadio.IsChecked == true;
            // галочки правишь только в свободном предназначении и только при переборе
            rulesPanel.IsEnabled = rulesApply && _manualPurpose;
            rulesHeader.Opacity = rulesApply ? 1.0 : 0.4;
            RefreshCardTooltips();   // жадный расчёт — исходные смыслы карт
        }

        private bool _requirePerson;   // предназначение «на человека»: в цели нужна карта-персона
        private bool _manualPurpose;   // «свободный» режим — галочки правит пользователь

        // предназначение задаёт, какие блоки свёртки включены. По Реутову задокументирована
        // одна цель — программа к цели; остальные пункты — честные адаптации механики.
        private void Purpose_Changed(object sender, RoutedEventArgs e)
        {
            if (greetingCheck == null || hungCheck == null || resultCheck == null) return; // ещё грузится
            _requirePerson = false;
            bool manual = false;

            if (purposeGoal != null && purposeGoal.IsChecked == true)
            {
                greetingCheck.IsChecked = true; hungCheck.IsChecked = false; resultCheck.IsChecked = true;
                _purposeMode = PurposeMode.Goal;
            }
            else if (purposeReutov != null && purposeReutov.IsChecked == true)
            {
                greetingCheck.IsChecked = true; hungCheck.IsChecked = false; resultCheck.IsChecked = true;
                _purposeMode = PurposeMode.Reutov;
            }
            else if (purposeHung != null && purposeHung.IsChecked == true)
            {
                greetingCheck.IsChecked = true; hungCheck.IsChecked = true; resultCheck.IsChecked = false;
                _purposeMode = PurposeMode.Hung;
            }
            else if (purposePerson != null && purposePerson.IsChecked == true)
            {
                greetingCheck.IsChecked = true; hungCheck.IsChecked = false; resultCheck.IsChecked = true;
                _requirePerson = true;
                _purposeMode = PurposeMode.Person;
            }
            else if (purposeDay != null && purposeDay.IsChecked == true)
            {
                greetingCheck.IsChecked = true; hungCheck.IsChecked = false; resultCheck.IsChecked = false;
                _purposeMode = PurposeMode.Day;
            }
            else
            {
                manual = true;
                _purposeMode = PurposeMode.Free;
            }

            // в свободном режиме галочки не блокируем; в остальных — фиксируем под предназначение
            _manualPurpose = manual;
            if (rulesPanel != null) rulesPanel.IsEnabled = manual && backtrackRadio.IsChecked == true;
            RefreshCardTooltips();
        }

        // подсказки на картах показывают смысл под текущее предназначение
        private void RefreshCardTooltips()
        {
            if (cardGrid == null) return;
            foreach (var ch in cardGrid.Children)
                if (ch is System.Windows.FrameworkElement fe && fe.Tag is Card c)
                    fe.ToolTip = DescribeCard(c);
        }

        private void FindChain_Click(object sender, RoutedEventArgs e)
        {
            List<Card> target = _finalStack.ToList();
            if (target.Count == 0)
            {
                MessageBox.Show("Не выбраны карты для финальной стопки!", "Ошибка", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            // предназначение «на встречу с человеком»: в цели обязана быть карта-персона
            if (_requirePerson && !target.Any(c => c.Rank >= 11 && c.Rank <= 13))
            {
                MessageBox.Show(
                    "Предназначение «на встречу с человеком»: добавьте в цель карту-персону — Валета, Даму или Короля.",
                    "Нет персоны в цели", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            if (greedyRadio.IsChecked == true)
            {
                FindChainGreedy(target);
                return;
            }

            var rules = new ChainRules
            {
                Greeting = greetingCheck.IsChecked == true,
                Hung = hungCheck.IsChecked == true,
                Result = resultCheck.IsChecked == true
            };

            List<Card> hung = rules.Hung ? _hungStack.ToList() : new List<Card>();

            // соседние звенья цели обязаны сцепляться между собой
            for (int i = 1; i < target.Count; i++)
            {
                if (!CanMerge(target[i - 1], target[i]))
                {
                    MessageBox.Show(
                        $"Звенья цели {target[i - 1]} и {target[i]} не сцепляются: нужна общая масть или общее достоинство.",
                        "Цель не свёрнута", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }
            }

            // 3. результат — замыкающее звено цели
            Card addedResult = null;
            if (rules.Result && target[target.Count - 1].Rank != 10)
            {
                Card last = target[target.Count - 1];
                addedResult = _allCards.FirstOrDefault(c => c.Rank == 10
                                                            && CanMerge(last, c)
                                                            && !target.Any(t => Same(t, c))
                                                            && !hung.Any(h => Same(h, c)));
                if (addedResult == null)
                {
                    MessageBox.Show(
                        "Не нашлось свободной десятки, сцепляющейся с хвостом цели. Снимите правило 3 или измените цель.",
                        "Результат не дописать", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }
                target.Add(addedResult);
            }

            int reserved = target.Count + hung.Count + (rules.Greeting ? GreetingLength : 0);
            if (reserved > DeckSize)
            {
                MessageBox.Show(
                    $"Не хватает места в колоде: цель ({target.Count}) + зависшее ({hung.Count}) + приветствие ({(rules.Greeting ? GreetingLength : 0)}) больше 36 звеньев.",
                    "Ошибка", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            if (!int.TryParse(shuffleTimesTextBox.Text?.Trim(), out int shuffleTimes) || shuffleTimes < 1)
            {
                shuffleTimes = 1;
                shuffleTimesTextBox.Text = "1";
            }

            _cts?.Cancel();
            _cts = new CancellationTokenSource();
            CancellationToken token = _cts.Token;

            _attemptCount = 0;
            UpdateAttemptCounter();
            AppendLog(BuildPlanNote(rules, target, hung, addedResult));

            Task.Run(() =>
            {
                Random random = new Random(Guid.NewGuid().GetHashCode());

                while (!token.IsCancellationRequested)
                {
                    List<Card> pool = _allCards
                        .Where(c => !target.Any(t => Same(t, c)) && !hung.Any(h => Same(h, c)))
                        .OrderBy(_ => random.Next())
                        .ToList();
                    pool.ShuffleMultiple(shuffleTimes);

                    List<Card> hungOrder = hung.OrderBy(_ => random.Next()).ToList();

                    List<Card> chain = BuildChain(pool, hungOrder, target, rules, token);

                    _attemptCount++;
                    UpdateAttemptCounter();

                    if (chain != null && chain.Count == DeckSize)
                    {
                        Dispatcher.Invoke(() =>
                        {
                            DisplayChain(chain, rules, target.Count, hung.Count, addedResult);
                            MessageBox.Show("Цепочка найдена!", "Успех", MessageBoxButton.OK, MessageBoxImage.Information);
                        });
                        return;
                    }
                }
            }, token);
        }

        /// <summary>
        /// Прежний расчёт: карта за картой пристраивается к голове цепочки, пока не кончится колода.
        /// Правила свёрток здесь не действуют — этот режим оставлен как отдельный инструмент.
        /// </summary>
        private void FindChainGreedy(List<Card> finalStack)
        {
            if (!int.TryParse(shuffleTimesTextBox.Text?.Trim(), out int shuffleTimes) || shuffleTimes < 1)
            {
                shuffleTimes = 1;
                shuffleTimesTextBox.Text = "1";
            }

            _cts?.Cancel();
            _cts = new CancellationTokenSource();
            CancellationToken token = _cts.Token;

            _attemptCount = 0;
            UpdateAttemptCounter();
            AppendLog("── Жадный расчёт ──\r\nПравила свёрток не применяются: цепочка растёт от цели назад, наугад.\r\n"
                      + $"Цель: {string.Join(", ", finalStack.Select(c => c.ToString()))}");

            Task.Run(() =>
            {
                Random random = new Random(Guid.NewGuid().GetHashCode());

                while (!token.IsCancellationRequested)
                {
                    List<Card> shuffledDeck = _allCards.OrderBy(_ => random.Next()).ToList();
                    shuffledDeck.ShuffleMultiple(shuffleTimes);

                    List<Card> remainingDeck = shuffledDeck.Except(finalStack, new CardComparer()).ToList();

                    List<Card> chain = BuildChainGreedy(remainingDeck, finalStack);

                    _attemptCount++;
                    UpdateAttemptCounter();

                    if (chain != null && chain.Count == DeckSize)
                    {
                        Dispatcher.Invoke(() =>
                        {
                            DisplayChainPlain(chain);
                            MessageBox.Show("Цепочка найдена!", "Успех", MessageBoxButton.OK, MessageBoxImage.Information);
                        });
                        return;
                    }
                }
            }, token);
        }

        private List<Card> BuildChainGreedy(List<Card> remainingDeck, List<Card> finalStack)
        {
            List<Card> chain = new List<Card>(finalStack);

            while (remainingDeck.Count > 0)
            {
                Card nextCard = remainingDeck.FirstOrDefault(card => CanMerge(card, chain.First()));
                if (nextCard == null) return null;

                chain.Insert(0, nextCard);
                remainingDeck.Remove(nextCard);
            }

            return chain;
        }

        private void DisplayChainPlain(List<Card> chain)
        {
            var sb = new StringBuilder();
            sb.AppendLine("Найденная цепочка:");
            for (int i = 0; i < chain.Count; i++)
                sb.AppendLine($"{i + 1}. {chain[i]}: {DescribeCard(chain[i])}");

            string text = sb.ToString();
            AppendLog(text);
            MessageBox.Show(text, "Цепочка", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        /// <summary>
        /// Перебором с возвратами укладывает 36 звеньев так, чтобы соблюдались правила свёрток:
        /// приветствие духа в начале, блок зависшего сразу за ним, цель с результатом в хвосте.
        /// </summary>
        private List<Card> BuildChain(List<Card> pool, List<Card> hung, List<Card> target, ChainRules rules, CancellationToken token)
        {
            int freeLength = DeckSize - target.Count;
            if (freeLength < 0) return null;

            int hungStart = rules.Greeting ? GreetingLength : 0;
            int hungEnd = hungStart + hung.Count; // граница блока зависшего, не включая

            var slots = new Card[freeLength];
            var poolUsed = new bool[pool.Count];
            var hungUsed = new bool[hung.Count];
            int budget = 200000; // потолок перебора: не найдя решения, пробуем новое тасование

            bool Place(int index)
            {
                if (token.IsCancellationRequested) return false;
                if (budget-- <= 0) return false;

                if (index == freeLength)
                    return freeLength == 0 || CanMerge(slots[freeLength - 1], target[0]);

                Card previous = index > 0 ? slots[index - 1] : null;
                bool lastFree = index == freeLength - 1;
                bool inHungBlock = rules.Hung && hung.Count > 0 && index >= hungStart && index < hungEnd;

                if (inHungBlock)
                {
                    for (int i = 0; i < hung.Count; i++)
                    {
                        if (hungUsed[i]) continue;
                        Card candidate = hung[i];
                        if (previous != null && !CanMerge(previous, candidate)) continue;
                        if (lastFree && !CanMerge(candidate, target[0])) continue;

                        hungUsed[i] = true;
                        slots[index] = candidate;
                        if (Place(index + 1)) return true;
                        hungUsed[i] = false;
                    }
                    return false;
                }

                for (int i = 0; i < pool.Count; i++)
                {
                    if (poolUsed[i]) continue;
                    Card candidate = pool[i];
                    // 1. приветствие духа — только мелкие быстрые события: перемещение, поглощение, общение
                    if (rules.Greeting && index < GreetingLength && candidate.Rank > 8) continue;
                    if (previous != null && !CanMerge(previous, candidate)) continue;
                    if (lastFree && !CanMerge(candidate, target[0])) continue;

                    poolUsed[i] = true;
                    slots[index] = candidate;
                    if (Place(index + 1)) return true;
                    poolUsed[i] = false;
                }
                return false;
            }

            if (!Place(0)) return null;

            var chain = new List<Card>(slots);
            chain.AddRange(target);
            return chain;
        }

        private bool CanMerge(Card card1, Card card2)
        {
            return card1.Suit == card2.Suit || card1.Rank == card2.Rank;
        }

        private string BuildPlanNote(ChainRules rules, List<Card> target, List<Card> hung, Card addedResult)
        {
            var sb = new StringBuilder();
            sb.AppendLine("── Раскладка цепочки ──");
            sb.AppendLine(rules.Greeting
                ? "1. Приветствие духа: звенья 1–3, только 6/7/8 — мелкие и быстрые."
                : "1. Приветствие духа: правило снято.");
            if (!rules.Hung)
                sb.AppendLine("2. Проработка зависшего: правило снято.");
            else if (hung.Count == 0)
                sb.AppendLine("2. Проработка зависшего: список пуст, блок не ставится.");
            else
                sb.AppendLine($"2. Проработка зависшего: {hung.Count} звен. сразу после приветствия ({string.Join(", ", hung.Select(c => c.ToString()))}).");
            if (rules.Result)
                sb.AppendLine(addedResult == null
                    ? "3. Результат: цель уже замыкается десяткой."
                    : $"3. Результат: в хвост цели дописано звено {addedResult} — {DescribeCard(addedResult)}");
            else
                sb.AppendLine("3. Результат: правило снято.");
            sb.AppendLine($"Цель: {string.Join(", ", target.Select(c => c.ToString()))}");
            return sb.ToString();
        }

        private void DisplayChain(List<Card> chain, ChainRules rules, int targetLength, int hungCount, Card addedResult)
        {
            int hungStart = rules.Greeting ? GreetingLength : 0;
            int hungEnd = hungStart + (rules.Hung ? hungCount : 0);
            int targetStart = chain.Count - targetLength;

            var sb = new StringBuilder();
            sb.AppendLine("Найденная цепочка:");

            for (int i = 0; i < chain.Count; i++)
            {
                if (rules.Greeting && i == 0)
                    sb.AppendLine("[ПРИВЕТСТВИЕ ДУХА]");
                if (rules.Hung && hungCount > 0 && i == hungStart)
                    sb.AppendLine("[ПРОРАБОТКА ЗАВИСШЕГО]");
                if (i == hungEnd && i < targetStart && (rules.Greeting || hungCount > 0))
                    sb.AppendLine("[ТЕЛО ЦЕПОЧКИ]");
                if (i == targetStart)
                    sb.AppendLine("[ЦЕЛЬ]");
                if (addedResult != null && Same(chain[i], addedResult))
                    sb.AppendLine("[РЕЗУЛЬТАТ]");

                sb.AppendLine($"{i + 1}. {chain[i]}: {DescribeCard(chain[i])}");
            }

            if (rules.Result)
                sb.AppendLine("Замыкание: отметь радость от свершившегося — иначе цепочка не закрыта.");

            string text = sb.ToString();
            AppendLog(text);
            MessageBox.Show(text, "Цепочка", MessageBoxButton.OK, MessageBoxImage.Information);
        }

        private void UpdateAttemptCounter()
        {
            Dispatcher.Invoke(() =>
            {
                attemptCounterText.Text = $"Попыток: {_attemptCount}";
            });
        }

        private void AppendLog(string message)
        {
            Dispatcher.Invoke(() =>
            {
                logTextBox.AppendText(message + "\r\n");
                logTextBox.ScrollToEnd();
            });
        }

        private void Reset_Click(object sender, RoutedEventArgs e)
        {
            _finalStack.Clear();
            _hungStack.Clear();
            _attemptCount = 0;
            UpdateAttemptCounter();
            _cts?.Cancel();
        }

        private void Stop_Click(object sender, RoutedEventArgs e)
        {
            _cts?.Cancel();
        }

        // ── экспорт трактовки-цепочки из лога: файлом или в буфер ──
        private string CurrentPurposeTitle()
        {
            if (purposeReutov != null && purposeReutov.IsChecked == true) return "По Реутову (выигрыш)";
            if (purposeHung != null && purposeHung.IsChecked == true) return "Разрядка зависшего";
            if (purposePerson != null && purposePerson.IsChecked == true) return "На встречу с человеком";
            if (purposeDay != null && purposeDay.IsChecked == true) return "Программа дня";
            if (purposeFree != null && purposeFree.IsChecked == true) return "Свободный расклад";
            return "Королевский";
        }

        private string ExportText()
        {
            var sb = new StringBuilder();
            sb.AppendLine("ПАСЬЯНС МЕДИЧИ — трактовка цепочки");
            sb.AppendLine("Предназначение: " + CurrentPurposeTitle());
            sb.AppendLine("Алгоритм: " + (greedyRadio != null && greedyRadio.IsChecked == true
                ? "жадный (старый)" : "перебор с возвратами"));
            sb.AppendLine(new string('─', 40));
            sb.AppendLine();
            sb.Append(logTextBox != null ? logTextBox.Text : "");
            return sb.ToString();
        }

        private void Export_Click(object sender, RoutedEventArgs e)
        {
            if (logTextBox == null || string.IsNullOrWhiteSpace(logTextBox.Text))
            {
                MessageBox.Show("Лог пуст — сначала найдите цепочку.", "Нечего сохранять",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            var dlg = new Microsoft.Win32.SaveFileDialog
            {
                Title = "Сохранить трактовку цепочки",
                Filter = "Текст (*.txt)|*.txt|Все файлы (*.*)|*.*",
                FileName = "Пасьянс Медичи — " + CurrentPurposeTitle() + ".txt"
            };
            if (dlg.ShowDialog() != true) return;
            try
            {
                System.IO.File.WriteAllText(dlg.FileName, ExportText(), new System.Text.UTF8Encoding(true));
                AppendLog("Трактовка сохранена: " + dlg.FileName);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Не удалось сохранить: " + ex.Message, "Ошибка",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void Copy_Click(object sender, RoutedEventArgs e)
        {
            if (logTextBox == null || string.IsNullOrWhiteSpace(logTextBox.Text))
            {
                MessageBox.Show("Лог пуст — сначала найдите цепочку.", "Нечего копировать",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }
            try { Clipboard.SetText(ExportText()); AppendLog("Трактовка скопирована в буфер обмена."); }
            catch (Exception ex)
            {
                MessageBox.Show("Не удалось скопировать: " + ex.Message, "Ошибка",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }
}
