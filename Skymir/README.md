# Skymir

Достаёт книги Skyrim из плагинов и сейвов, считает по ним статистику и
верстает PDF. Только стандартная библиотека Python — ни pip, ни SSEEdit,
ни xTranslator не нужны.

## Что где лежит на самом деле

- **Текст книги** — в плагине (`.esm`/`.esp`/`.esl`), запись `BOOK`, поле `DESC`.
  У ванильных плагинов там не текст, а номер строки: сам текст в
  `strings/skyrim_russian.dlstrings` **внутри** `Skyrim - Interface.bsa`.
  Skymir читает BSA сам (включая LZ4-сжатие SSE).
- **Сейв `.ess`** текстов книг не содержит. В нём — изменённые формы
  (ChangeForm). Прочитанная или подобранная книга оставляет там след,
  по нему Skymir и сверяется со списком книг из плагинов.
- **Ко-сейв `.skse`** — вот там лежат тексты, сочинённые модами прямо в
  игре (дневники, заметки игрока). Достаются командой `cosave`.

## Команды

```bash
python skymir.py scan
```
Что найдено: игра, 80 плагинов, сейвы, чем печатать.

```bash
python skymir.py extract              # ваниль и DLC
python skymir.py extract all --txt    # всё подряд + отдельные txt
python skymir.py extract cc           # только Creation Club
python skymir.py extract Dragonborn Dawnguard
```
Результат — `out/books.json`.

```bash
python skymir.py list --grep "Барензия"
python skymir.py list --plugin Dragonborn --nonempty
```

```bash
python skymir.py save Autosave3
python skymir.py save Autosave3 --pdf
```
Разбирает сейв: персонаж, место, список плагинов, сколько ChangeForm,
и какие книги в этом прохождении были затронуты. Имя можно писать куском —
файл ищется в папке сохранений.

```bash
python skymir.py cosave МойСейв.skse
```

```bash
python skymir.py pdf --grep "Барензия" --out "Барензия.pdf"
python skymir.py pdf --plugin Skyrim.esm --title "Библиотека Скайрима"
```
Верстает книжный PDF: обложка, содержание, страницы А4, буквица,
сохранённые разрывы страниц оригинала. Иероглифы и знаки из области PUA
получают свой шрифт — пригодится для книг из мода с иероглифами.

```bash
python skymir.py analyze
```
`out/analysis.md`: объёмы, самые длинные книги, частотный словарь,
доля кириллицы / латиницы / иероглифов по каждой книге.

## Печать

PDF печатается headless-браузером. **Edge 151 в этом режиме молча ничего
не выдаёт**, поэтому первым берётся Chrome. Если оба откажут — открыть
`out/*.html` руками и напечатать через Ctrl+P.

## Настройка

`config.json` — пути к игре и сохранениям, язык строк (`null` = определить
сам), `extra_plugin_dirs` для модов из Mod Organizer или Vortex.

## Устройство

| файл | что делает |
|---|---|
| `lib/lz4.py` | LZ4: блоки и frame (BSA SSE, тела сейвов) |
| `lib/bsa.py` | архивы Bethesda 104/105 |
| `lib/strings.py` | таблицы локализации STRINGS/DLSTRINGS/ILSTRINGS |
| `lib/plugin.py` | плагины TES5: группы, записи, сжатие, BOOK |
| `lib/save.py` | сейвы `.ess` и ко-сейвы `.skse` |
| `lib/render.py` | разметка Bethesda → HTML → PDF |
| `lib/analyze.py` | статистика корпуса |

Проверено на: Skyrim.esm — 821 книга, 2 056 528 знаков; сейв Autosave3 —
19 327 ChangeForm разобраны полностью, до последнего байта.
