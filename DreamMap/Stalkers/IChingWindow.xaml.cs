using System;
using System.Globalization;
using System.Text;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace DreamMap.Stalkers
{
    public partial class IChingWindow : Window
    {
        private readonly Random _random;

        // Таблица соответствия между бинарным индексом (0..63) и номером гексаграммы по порядку Кинг Вэнь.
        // Например, если все линии инь (индекс 0), то KingWenOrder[0] = 2 (гексаграмма 坤),
        // а если все линии ян (индекс 63), то KingWenOrder[63] = 1 (гексаграмма 乾).
        private static readonly int[] KingWenOrder = new int[64]
        {
            2, 24, 7, 19, 15, 36, 46, 11,
            16, 51, 40, 54, 62, 55, 32, 34,
            8, 3, 29, 60, 39, 63, 48, 5,
            45, 17, 47, 58, 31, 49, 28, 43,
            23, 27, 4, 41, 52, 22, 18, 26,
            35, 21, 64, 38, 56, 30, 50, 14,
            20, 59, 6, 61, 53, 37, 57, 9,
            12, 25, 44, 13, 10, 42, 33, 1
        };

        // Массив описаний гексаграмм.
        private static readonly HexInfo[] AllHexagrams = new HexInfo[64]
        {
            new HexInfo { Number = 1, Title = "1. 乾 (Qián), Творчество", Description = "Символ творящей силы. Успех достигается настойчивостью и самосовершенствованием." },
            new HexInfo { Number = 2, Title = "2. 坤 (Kūn), Исполнение", Description = "Символ земли и восприимчивости. Мягкость и поддержка ведут к изобилию и гармонии." },
            new HexInfo { Number = 3, Title = "3. 屯 (Zhūn), Начальная трудность", Description = "Начальные усилия в сложных условиях. Требуют терпения и внешней поддержки." },
            new HexInfo { Number = 4, Title = "4. 蒙 (Méng), Недоразвитость", Description = "Юность и незрелость. Нужны наставления и учёба, чтобы избежать ошибок." },
            new HexInfo { Number = 5, Title = "5. 需 (Xū), Ожидание", Description = "Терпеливое ожидание подходящего момента. Спокойная подготовка к действию." },
            new HexInfo { Number = 6, Title = "6. 訟 (Sòng), Тяжба", Description = "Спор и разногласия. Следует найти справедливое решение и избегать пустой конфронтации." },
            new HexInfo { Number = 7, Title = "7. 師 (Shī), Войско", Description = "Организованная коллективная сила. Дисциплина и ясная цель ведут к успеху." },
            new HexInfo { Number = 8, Title = "8. 比 (Bǐ), Приближение", Description = "Единство и доверие. Способствует сплочению и общим целям." },
            new HexInfo { Number = 9, Title = "9. 小畜 (Xiǎo Chù), Малая сила", Description = "Мягкое, постепенное влияние. Требует скромности и упорства." },
            new HexInfo { Number = 10, Title = "10. 履 (Lǚ), Наступление", Description = "Осторожный шаг вперёд по тонкой грани. Нужно удерживать равновесие." },
            new HexInfo { Number = 11, Title = "11. 泰 (Tài), Расцвет", Description = "Гармония и процветание. Силы неба и земли соединяются." },
            new HexInfo { Number = 12, Title = "12. 否 (Pǐ), Упадок", Description = "Противоположность расцвету: застой. Следует укрепить внутренний стержень." },
            new HexInfo { Number = 13, Title = "13. 同人 (Tóng Rén), Единомышленники", Description = "Объединение вокруг общей цели, приводит к успеху через взаимопонимание." },
            new HexInfo { Number = 14, Title = "14. 大有 (Dà Yǒu), Обладание великим", Description = "Большие ресурсы и влияние. Нужно использовать их мудро и скромно." },
            new HexInfo { Number = 15, Title = "15. 謙 (Qiān), Смирение", Description = "Сила скромности и сдержанности. Признак истинной внутренней силы." },
            new HexInfo { Number = 16, Title = "16. 豫 (Yù), Вольность", Description = "Воодушевление и радостный подъём. Стоит использовать энергию на благое дело." },
            new HexInfo { Number = 17, Title = "17. 隨 (Suí), Следование", Description = "Приспособление к переменам, не теряя собственных корней." },
            new HexInfo { Number = 18, Title = "18. 蠱 (Gǔ), Исправление порчи", Description = "Устранение старых ошибок ради обновления и роста." },
            new HexInfo { Number = 19, Title = "19. 臨 (Lín), Посещение", Description = "Возрастание влияния, покровительство. Будьте справедливы и снисходительны." },
            new HexInfo { Number = 20, Title = "20. 観 (Guān), Созерцание", Description = "Вглядеться в суть, понять причины. Спокойное наблюдение рождает мудрость." },
            new HexInfo { Number = 21, Title = "21. 噬嗑 (Shì Kè), Стиснутые зубы", Description = "Решительное устранение препятствий и несправедливости." },
            new HexInfo { Number = 22, Title = "22. 賁 (Bì), Убранство", Description = "Внешняя красота. Однако внутренняя суть важнее поверхностного блеска." },
            new HexInfo { Number = 23, Title = "23. 剥 (Bō), Бо", Description = "Постепенное «слущивание» старого. В этой гексаграмме верхняя линия сплошная, а остальные – разрывные." },
            new HexInfo { Number = 24, Title = "24. 复 (Fù), Возврат", Description = "Возвращение к истокам. Новый цикл, время пересмотреть пройденный путь." },
            new HexInfo { Number = 25, Title = "25. 无妄 (Wú Wàng), Непорочность", Description = "Чистые мотивы без корысти. Искренность и прямота приносят удачу." },
            new HexInfo { Number = 26, Title = "26. 大畜 (Dà Chù), Воспитание великим", Description = "Накопление силы и мудрости. Самодисциплина перед рывком." },
            new HexInfo { Number = 27, Title = "27. 頤 (Yí), Питание", Description = "Забота о пище тела и духа. Следите за тем, что потребляете и чем делитесь." },
            new HexInfo { Number = 28, Title = "28. 大過 (Dà Guò), Переразвитие великого", Description = "Чрезмерная нагрузка грозит поломкой. Укрепите слабые места и ослабьте избыточное." },
            new HexInfo { Number = 29, Title = "29. 坎 (Kǎn), Бездна", Description = "Повторная опасность. Сохраняйте стойкость и веру в правильность пути." },
            new HexInfo { Number = 30, Title = "30. 離 (Lí), Сияние", Description = "Яркость и пламя. Огонь требует постоянного питания, разум — осознанности." },
            new HexInfo { Number = 31, Title = "31. 咸 (Xián), Взаимодействие", Description = "Притяжение сил, создающее союз. Важна искренность и взаимное уважение." },
            new HexInfo { Number = 32, Title = "32. 恒 (Héng), Постоянство", Description = "Длительная стабильность. Верность принципам приводит к твёрдому результату." },
            new HexInfo { Number = 33, Title = "33. 遯 (Dùn), Бегство", Description = "Временное отступление, чтобы сохранить силы и дождаться лучшего часа." },
            new HexInfo { Number = 34, Title = "34. 大壯 (Dà Zhuàng), Великая мощь", Description = "Проявление силы и решимости. Действуйте этично и осмотрительно." },
            new HexInfo { Number = 35, Title = "35. 晉 (Jìn), Восход", Description = "Поступательное продвижение, подобно восходу солнца. Используйте момент роста." },
            new HexInfo { Number = 36, Title = "36. 明夷 (Míng Yí), Поражение света", Description = "Свет в тени внешних обстоятельств. Иногда лучше скрывать достоинства." },
            new HexInfo { Number = 37, Title = "37. 家人 (Jiā Rén), Домашние", Description = "Порядок и взаимная поддержка в семье (или коллективе)." },
            new HexInfo { Number = 38, Title = "38. 睽 (Kuí), Разлад", Description = "Расхождение взглядов. Может привести к конфликту или стимулировать поиск нового." },
            new HexInfo { Number = 39, Title = "39. 蹇 (Jiǎn), Препятствие", Description = "Трудности требуют упорства и помощи друзей. Преодолев преграду, обретаете силу." },
            new HexInfo { Number = 40, Title = "40. 解 (Xiè), Разрешение", Description = "Освобождение от уз и проблем. Необходимо решительное действие." },
            new HexInfo { Number = 41, Title = "41. 損 (Sǔn), Убыль", Description = "Добровольное сокращение внешнего ради укрепления внутреннего." },
            new HexInfo { Number = 42, Title = "42. 益 (Yì), Приумножение", Description = "Увеличение потенциала. Делитесь благом — оно приумножается." },
            new HexInfo { Number = 43, Title = "43. 夬 (Guài), Выход", Description = "Решительный прорыв. Чёткое заявление позиции для устранения препятствий." },
            new HexInfo { Number = 44, Title = "44. 姤 (Gòu), Столкновение", Description = "Неожиданная встреча или влияние. Будьте бдительны, чтобы не допустить хаоса." },
            new HexInfo { Number = 45, Title = "45. 萃 (Cuì), Воссоединение", Description = "Сбор людей и ресурсов для общей цели. Искреннее объединение рождает успех." },
            new HexInfo { Number = 46, Title = "46. 升 (Shēng), Подъём", Description = "Постепенное восхождение. Шаг за шагом продвигайтесь к вершине." },
            new HexInfo { Number = 47, Title = "47. 困 (Kùn), Истощение", Description = "Ситуация ограничений и трудностей. Проверьте внутренние ресурсы и не теряйте дух." },
            new HexInfo { Number = 48, Title = "48. 井 (Jǐng), Колодец", Description = "Источник жизни, требующий обновления. Общая опора для многих." },
            new HexInfo { Number = 49, Title = "49. 革 (Gé), Смена", Description = "Революционные перемены. Старое изжило себя, наступает время обновления." },
            new HexInfo { Number = 50, Title = "50. 鼎 (Dǐng), Жертвенник", Description = "Символ котла и преобразования. Высшая трансформация и духовная пища." },
            new HexInfo { Number = 51, Title = "51. 震 (Zhèn), Возбуждение", Description = "Гром, внезапный толчок. Пробуждает и заставляет действовать." },
            new HexInfo { Number = 52, Title = "52. 艮 (Gèn), Сосредоточенность", Description = "Спокойствие горы. Умение остановиться и вглядеться в себя." },
            new HexInfo { Number = 53, Title = "53. 漸 (Jiàn), Постепенность", Description = "Медленный, но верный рост, подобно созреванию плода. Требует времени." },
            new HexInfo { Number = 54, Title = "54. 歸妹 (Guī Mèi), Невеста", Description = "Ситуация, где нужно принимать условия. Помните об этике и гармонии." },
            new HexInfo { Number = 55, Title = "55. 豐 (Fēng), Изобилие", Description = "Пик процветания и яркости. Важно не забывать о мере и сути." },
            new HexInfo { Number = 56, Title = "56. 旅 (Lǚ), Странствие", Description = "Путешествие и жизнь вдали от дома. Сохраняйте осторожность и достоинство." },
            new HexInfo { Number = 57, Title = "57. 巽 (Xùn), Проникновение", Description = "Мягкая сила ветра. Деликатное воздействие способно проникать глубоко." },
            new HexInfo { Number = 58, Title = "58. 兑 (Duì), Радость", Description = "Искренняя открытость и весёлое общение. Главное — не стать поверхностным." },
            new HexInfo { Number = 59, Title = "59. 涣 (Huàn), Рассеяние", Description = "Разуплотнение старых форм. Освобождение от оков и объединение новых сил." },
            new HexInfo { Number = 60, Title = "60. 節 (Jié), Ограничение", Description = "Разумные границы и правила. Помогают сохранить энергию и фокус." },
            new HexInfo { Number = 61, Title = "61. 中孚 (Zhōng Fú), Внутренняя правда", Description = "Искренность сердца создает доверие и гармонию в отношениях." },
            new HexInfo { Number = 62, Title = "62. 小過 (Xiǎo Guò), Переразвитие малого", Description = "Чрезмерное внимание к деталям. Нужна осторожность, чтобы не упустить главное." },
            new HexInfo { Number = 63, Title = "63. 既濟 (Jì Jì), Уже конец", Description = "Все элементы на своих местах. Но требуется поддерживать порядок, чтобы не рухнул." },
            new HexInfo { Number = 64, Title = "64. 未濟 (Wèi Jì), Еще не конец", Description = "Последний шаг до полного завершения. Нужна аккуратность и осознанность." }
        };

        public IChingWindow()
        {
            InitializeComponent();
            _random = new Random();
        }

        private void TitleBar_MouseLeftButtonDown(object sender, System.Windows.Input.MouseButtonEventArgs e)
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

        private void ToggleMaximize()
        {
            WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
        }

        // Обработчик нажатия кнопки генерации гексаграмм.
        private void Generate_Click(object sender, RoutedEventArgs e)
        {
            // Генерируем исходную гексаграмму.
            Line[] originalLines = GenerateHexagram();
            int originalNumber = GetKingWenNumber(originalLines);
            HexInfo originalHex = AllHexagrams[originalNumber - 1];

            // Преобразуем старые (изменяющиеся) линии во вторую устойчивую гексаграмму.
            Line[] finalLines = MakeStable(originalLines);
            int finalNumber = GetKingWenNumber(finalLines);
            HexInfo finalHex = AllHexagrams[finalNumber - 1];

            // Формируем текстовое описание гексаграмм.
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("ИСХОДНАЯ ГЕКСАГРАММА:");
            sb.AppendLine($"King Wen = {originalNumber}");
            sb.AppendLine($"{originalHex.Title}");
            sb.AppendLine();
            sb.AppendLine($"{originalHex.Description}");
            sb.AppendLine("--------------------------------");
            sb.AppendLine("РЕЗУЛЬТИРУЮЩАЯ ГЕКСАГРАММА:");
            sb.AppendLine($"King Wen = {finalNumber}");
            sb.AppendLine($"{finalHex.Title}");
            sb.AppendLine();
            sb.AppendLine($"{finalHex.Description}");

            resultTextBox.Text = sb.ToString();

            // Отрисовка гексаграмм с подписями.
            DrawHexagrams(originalLines, finalLines, originalHex, finalHex);
        }

        // Генерация исходной гексаграммы.
        // Для каждой линии проводится 3 броска (метод монет), сумма может быть 6, 7, 8 или 9.
        // Массив lines: индекс 0 – нижняя линия, индекс 5 – верхняя.
        private Line[] GenerateHexagram()
        {
            Line[] lines = new Line[6];
            for (int i = 0; i < 6; i++)
            {
                int sum = 0;
                for (int j = 0; j < 3; j++)
                {
                    // С вероятностью 50% добавляем 3, иначе 2.
                    sum += _random.Next(2) == 1 ? 3 : 2;
                }

                // Сумма определяет тип линии:
                // 6 – Старая Инь, 7 – Молодая Ян, 8 – Молодая Инь, 9 – Старая Ян.
                switch (sum)
                {
                    case 6:
                        lines[i] = new Line { IsYang = false, IsOld = true, WasOld = true };
                        break;
                    case 7:
                        lines[i] = new Line { IsYang = true, IsOld = false, WasOld = false };
                        break;
                    case 8:
                        lines[i] = new Line { IsYang = false, IsOld = false, WasOld = false };
                        break;
                    case 9:
                        lines[i] = new Line { IsYang = true, IsOld = true, WasOld = true };
                        break;
                }
            }

            return lines;
        }

        // Вычисление номера гексаграммы по бинарному индексу.
        // Массив lines хранит линии так, что lines[0] – нижняя, lines[5] – верхняя.
        // Нижняя линия соответствует младшему биту, а верхняя – старшему.
        private int GetKingWenNumber(Line[] lines)
        {
            int index = 0;
            for (int i = 0; i < 6; i++)
            {
                if (lines[5 - i].IsYang)
                {
                    index |= (1 << i);
                }
            }

            return KingWenOrder[index];
        }

        // Преобразование исходной гексаграммы во вторую устойчивую гексаграмму.
        // Если линия была изменяющейся (IsOld == true), она инвертируется, а значение WasOld сохраняется.
        private Line[] MakeStable(Line[] original)
        {
            Line[] res = new Line[6];
            for (int i = 0; i < 6; i++)
            {
                if (original[i].IsOld)
                {
                    res[i] = new Line
                    {
                        IsYang = !original[i].IsYang,
                        IsOld = false, // После преобразования линия становится устойчивой.
                        WasOld = original[i].WasOld
                    };
                }
                else
                {
                    res[i] = original[i];
                }
            }

            return res;
        }

        // Отрисовка обеих гексаграмм с подписями.
        // Здесь нижние линии (индекс 0) отображаются сверху, а верхние (индекс 5) – снизу.
        // Линии будут отрисованы на 15 пикселей ниже заголовка.
        private void DrawHexagrams(Line[] originalLines, Line[] finalLines, HexInfo originalHex, HexInfo finalHex)
        {
            // рисунок всегда 760×239, а в окне он вписывается в свою ячейку целиком
            int width = 760;
            int height = 239;

            if (width <= 0)
            {
                width = 760;
            }

            if (height <= 0)
            {
                height = 239;
            }

            double pixelsPerDip = VisualTreeHelper.GetDpi(this).PixelsPerDip;

            DrawingVisual visual = new DrawingVisual();
            using (DrawingContext dc = visual.RenderOpen())
            {
                SolidColorBrush background = new SolidColorBrush(Color.FromRgb(0x0A, 0x12, 0x0C));
                SolidColorBrush neon = new SolidColorBrush(Color.FromRgb(0x39, 0xFF, 0x14));
                SolidColorBrush muted = new SolidColorBrush(Color.FromRgb(0x5C, 0xFF, 0x9E));
                SolidColorBrush grid = new SolidColorBrush(Color.FromRgb(0x11, 0x28, 0x18));

                dc.DrawRectangle(background, null, new Rect(0, 0, width, height));

                double startX = 50;
                double titleY = 25;
                double lineStartY = titleY + 30;
                double spacing = 30;
                double offsetX = 300;

                DrawText(dc, "ИСХОДНАЯ: " + originalHex.Title, muted, startX, titleY - 20, 10, FontWeights.Bold, pixelsPerDip);
                for (int i = 0; i < 6; i++)
                {
                    DrawLine(dc, startX, lineStartY + spacing * i, originalLines[i], pixelsPerDip, neon);
                }

                DrawText(dc, "РЕЗУЛЬТИРУЮЩАЯ: " + finalHex.Title, muted, startX + offsetX, titleY - 20, 10, FontWeights.Bold, pixelsPerDip);
                for (int i = 0; i < 6; i++)
                {
                    DrawLine(dc, startX + offsetX, lineStartY + spacing * i, finalLines[i], pixelsPerDip, neon);
                }

                // Легкая "сеточка" и сканлайны для ретро-эффекта.
                Pen gridPen = new Pen(grid, 1);
                for (int y = 24; y < height; y += 4)
                {
                    gridPen.Brush.Opacity = 0.15;
                    dc.DrawLine(gridPen, new Point(6, y), new Point(width - 6, y));
                }
            }

            RenderTargetBitmap bmp = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
            bmp.Render(visual);
            hexagramImage.Source = bmp;
        }

        // Отрисовка отдельной линии с символом и подробным описанием.
        // Для второй гексаграммы используется сохранённое свойство WasOld для отражения исходного статуса линии.
        private void DrawLine(DrawingContext dc, double x, double y, Line line, double pixelsPerDip, Brush neonBrush)
        {
            Pen glow = new Pen(new SolidColorBrush(Color.FromArgb(90, 0x39, 0xFF, 0x14)), 8);
            Pen pen = new Pen(neonBrush, 4);
            if (line.IsYang)
            {
                // Для Ян – сплошная линия.
                dc.DrawLine(glow, new Point(x, y), new Point(x + 100, y));
                dc.DrawLine(pen, new Point(x, y), new Point(x + 100, y));
            }
            else
            {
                // Для Инь – линия с разрывом.
                dc.DrawLine(glow, new Point(x, y), new Point(x + 40, y));
                dc.DrawLine(glow, new Point(x + 60, y), new Point(x + 100, y));
                dc.DrawLine(pen, new Point(x, y), new Point(x + 40, y));
                dc.DrawLine(pen, new Point(x + 60, y), new Point(x + 100, y));
            }

            // Определяем символ линии в зависимости от её типа и изменяемости.
            string symbol = line.IsYang ? (line.WasOld ? "⚊→⚋" : "⚊") : (line.WasOld ? "⚋→⚊" : "⚋");
            string description = line.IsYang ? (line.WasOld ? "Старая Ян" : "Молодая Ян") : (line.WasOld ? "Старая Инь" : "Молодая Инь");

            string displayText = $"{symbol} ({description})";
            DrawText(dc, displayText, neonBrush, x + 105, y - 10, 12, FontWeights.Normal, pixelsPerDip);
        }

        private void DrawText(DrawingContext dc, string text, Brush brush, double x, double y, double fontSize, FontWeight weight, double pixelsPerDip)
        {
            Typeface typeface = new Typeface(new FontFamily("Consolas"), FontStyles.Normal, weight, FontStretches.Normal);
            FormattedText formatted = new FormattedText(
                text,
                CultureInfo.CurrentCulture,
                FlowDirection.LeftToRight,
                typeface,
                fontSize,
                brush,
                pixelsPerDip);

            dc.DrawText(formatted, new Point(x, y));
        }
    }

    // Структура для хранения информации о линии гексаграммы.
    public struct Line
    {
        public bool IsYang;  // Тип линии после преобразования (устойчивая).
        public bool IsOld;   // Текущий флаг изменяемости (false для устойчивых линий).
        public bool WasOld;  // Сохраняет информацию: была ли линия изменяющейся изначально.
    }

    // Класс для описания гексаграммы.
    public class HexInfo
    {
        public int Number { get; set; }
        public string Title { get; set; }
        public string Description { get; set; }
    }
}
