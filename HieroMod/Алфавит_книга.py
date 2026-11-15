# -*- coding: utf-8 -*-
"""Книги комплекта (обычный редактируемый текст, единая пагинация Писца):
  book 1     «Египетский алфавит» — фонетика, бонусные знаки, русский алфавит,
             египетские числа, разделители;
  book 2-4   «Все иероглифы» — 1071 знак с кодом Гардинера и русским описанием.
Плюс assets\\mdc_map.json — карта «латинская клавиша -> иероглиф» для кнопки
«Латиница -> иероглифы» в Писце.
Источники истины: Раскладка.html, Hermes\\...\\phonetic_alphabet.md, гардинер_ру.json.
Повторный запуск обновляет книги и seed (ручные правки этих книг перезапишутся)."""
import os, sys, re, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from hiero_core import load_store, rebuild, to_pua, HIERO_BASE, HIERO_TOP, PUA_BASE

TITLE, NUM = "Египетский алфавит", 1
CATALOG_TITLE, CATALOG_NUM = "Все иероглифы", 2

PHONETIC_MD = os.path.join(os.path.dirname(HERE), "Hermes", "Ankh",
                           "hieroglyph-oracle", "references", "phonetic_alphabet.md")
GARDINER_JSON = os.path.join(HERE, "гардинер_ру.json")

ALPHA_SIZE, ALPHA_PP = 36, 600
CATALOG_SIZE, CATALOG_PP = 34, 600
VOLUME_CHARS = 13500        # < MAX_CHARS_PER_VOLUME, том esp остаётся в лимитах

CAT = {"A": "мужчина и его занятия", "B": "женщина", "C": "божества",
       "D": "части тела человека", "E": "млекопитающие", "F": "части тел животных",
       "G": "птицы", "H": "части птиц", "I": "рептилии и амфибии", "K": "рыбы",
       "L": "насекомые и мелкие существа", "M": "растения", "N": "небо, земля, вода",
       "NL": "номы Нижнего Египта", "NU": "номы Верхнего Египта", "O": "постройки",
       "P": "суда", "Q": "мебель и погребальная утварь", "R": "храмовая утварь и эмблемы",
       "S": "короны, одежда, регалии", "T": "оружие и охота", "U": "орудия труда",
       "V": "верёвки, корзины, ткани", "W": "сосуды", "X": "хлеб",
       "Y": "письмо, игры, музыка", "Z": "штрихи и геометрия", "Aa": "разные знаки"}

NUMBERS = [
    ("\U000133FA", "1 — черта"), ("\U000133FB", "2"), ("\U000133FC", "3"),
    ("\U000133FD", "4"), ("\U000133FE", "5"), ("\U000133FF", "6"),
    ("\U00013400", "7"), ("\U00013401", "8"), ("\U00013402", "9"),
    ("\U00013386", "10 — путы для скота"),
    ("\U00013362", "100 — виток верёвки"),
    ("\U000131BC", "1 000 — цветок лотоса"),
    ("\U000130AD", "10 000 — палец"),
    ("\U00013190", "100 000 — головастик"),
    ("\U00013068", "1 000 000 — бог Хех, держащий небо"),
    ("\U00013386\U00013386\U000133FD", "пример: 24 — знаки складываются"),
]

SEPARATORS = [
    ("", "Знаков препинания у египтян не было — текст писали сплошь."),
    ("\U00013379", "начало картуша — в него заключали имя царя"),
    ("\U0001337B", "конец картуша"),
]

data = json.load(open(GARDINER_JSON, encoding="utf-8"))
code_to_pua = {}
for key, info in data.items():
    cp = int(key[2:], 16)
    if HIERO_BASE <= cp <= HIERO_TOP:
        code_to_pua[info["code"]] = chr(PUA_BASE + cp - HIERO_BASE)

def category(code):
    for pref in ("Aa", "NL", "NU"):
        if code.startswith(pref):
            return pref
    return code[0]

def line(glyphs, label):
    return ("%s  %s" % (glyphs, label)) if glyphs else label

def read_layout():
    """Секции раскладки шрифта: [(заголовок, [(клавиша, код, описание)...]), ...]."""
    html = open(os.path.join(HERE, "Раскладка.html"), encoding="utf-8").read()
    out = []
    for h2, table in re.findall(r"<h2>([^<]*?)</h2>\s*<table>(.*?)</table>", html, re.S):
        rows = re.findall(r"<td class='key'>(.*?)</td><td class='glyph'>.*?</td>"
                          r"<td>(.*?)</td><td>(.*?)</td>", table)
        out.append((h2.split("(")[0].strip(), rows))
    return out

def build_alphabet():
    parts = []
    layout_rows = []
    for sec_title, rows in read_layout():
        lines = ["— %s —" % sec_title]
        for k, code, desc in rows:
            layout_rows.append((k, code))
            lines.append(line(code_to_pua.get(code, "?"), "%s — %s" % (k, desc)))
        parts.append("\n".join(lines))
    md = open(PHONETIC_MD, encoding="utf-8").read().split("## Цифры")[0]
    lines = ["— Русский алфавит —",
             line(to_pua("𓋹")[0], "признак заглавной буквы (ставится перед знаком)"),
             line(to_pua("𓊽")[0], "джед — приставка расширенной буквы")]
    for label, glyphs in re.findall(r"^\|\s*`?(.+?)`?\s*\|\s*(\S+)\s*\|\s*$", md, re.M):
        if any(HIERO_BASE <= ord(c) <= HIERO_TOP for c in glyphs):
            lines.append(line(to_pua(glyphs)[0], label))
    parts.append("\n".join(lines))
    parts.append("\n".join(["— Египетские числа —"] +
                           [line(to_pua(g)[0], l) for g, l in NUMBERS]))
    parts.append("\n".join(["— Разделители текста —"] +
                           [line(to_pua(g)[0] if g else "", l) for g, l in SEPARATORS]))
    book = {"num": NUM, "title": TITLE, "text": "\n\n".join(parts),
            "size": ALPHA_SIZE, "per_page": ALPHA_PP}
    return book, layout_rows

def build_catalog():
    lines, cur = [], None
    for cp in range(HIERO_BASE, HIERO_TOP + 1):
        info = data.get("U+%05X" % cp)
        if not info:
            continue
        cat = category(info["code"])
        if cat != cur:
            lines.append("— Группа %s — %s —" % (cat, CAT[cat]))
            cur = cat
        lines.append(line(chr(PUA_BASE + cp - HIERO_BASE),
                          "%s — %s" % (info["code"], info["desc"])))
    vols, buf, size = [], [], 0
    for l in lines:
        if buf and size + len(l) + 1 > VOLUME_CHARS:
            vols.append(buf)
            buf, size = [], 0
        buf.append(l)
        size += len(l) + 1
    if buf:
        vols.append(buf)
    return [{"num": CATALOG_NUM + i,
             "title": "%s — том %d из %d" % (CATALOG_TITLE, i + 1, len(vols)),
             "text": "\n".join(v), "size": CATALOG_SIZE, "per_page": CATALOG_PP}
            for i, v in enumerate(vols)]

alphabet, layout_rows = build_alphabet()
seed_books = [alphabet] + build_catalog()

# карта MdC-раскладки для кнопки «Латиница -> иероглифы» в Писце
mdc = {k: code_to_pua[c] for k, c in layout_rows if c in code_to_pua}
json.dump(mdc, open(os.path.join(HERE, "assets", "mdc_map.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

# seed для комплекта: инсталлятор/Писец добавят книги на любом ПК (ensure_installed)
json.dump(seed_books, open(os.path.join(HERE, "assets", "seed_books.json"), "w",
                           encoding="utf-8"), ensure_ascii=False, indent=1)

skip = {b["num"] for b in seed_books}
books = [b for b in load_store()
         if b["num"] not in skip and b["num"] != 0 and not (990 <= b["num"] <= 999)
         and b["title"] != TITLE and not b["title"].startswith(CATALOG_TITLE)]
books += seed_books
rebuild(books)
print("Собраны книги:", ", ".join("book%d" % b["num"] for b in seed_books),
      "| MdC-карта:", len(mdc), "клавиш")
print("В игре в консоли (~):  bat book1, bat book2...  или  bat books")
