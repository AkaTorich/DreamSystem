# -*- coding: utf-8 -*-
"""Английский текст <-> письмо рукописи Войнича.

Шрифты EVA (European Voynich Alphabet) — стандартная транслитерация: каждой
латинской букве соответствует свой знак рукописи. Поэтому «шифрование» здесь
прямое: текст в плагине остаётся английским, а начертание даёт шрифт. Ключ
не нужен, извлечь книгу можно чем угодно.

Единственная правка — буква w: знака для неё в рукописи нет, поэтому она
пишется двумя v и склеивается обратно при чтении. Настоящее «vv» из
исходного слова (savvy, revved) разделяется неразрывным пробелом U+00A0,
иначе обратное чтение было бы неоднозначным.

Набор символов не задан списком, а читается из самого eva_font.swf —
пересоберёте шрифт другим составом, модуль подхватит его сам.
"""

import os
import struct

ESCAPE = " "            # неразрывный пробел: разделитель настоящих «vv»
FONT_MAIN = "$EVAFont"       # EVA2: прописные, строчные, цифры, знаки
FONT_HAND = "$EVAHandFont"   # EVA Hand 1: только строчные

SWF_NAME = "eva_font.swf"
_COVER = {}


def _swf_path():
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (os.path.join(here, "assets", SWF_NAME),
                 os.path.join(here, SWF_NAME)):
        if os.path.isfile(cand):
            return cand
    try:
        import hiero_core
        cand = os.path.join(hiero_core.resource_dir(), SWF_NAME)
        if os.path.isfile(cand):
            return cand
    except Exception:
        pass
    return None


def _read_coverage():
    """{имя шрифта: множество символов} из таблиц кодов DefineFont2."""
    path = _swf_path()
    if not path:
        return {}
    with open(path, "rb") as f:
        d = f.read()
    body = d[8:]
    p = ((5 + (body[0] >> 3) * 4) + 7) // 8 + 4
    out = {}
    while p + 2 <= len(body):
        th = struct.unpack_from("<H", body, p)[0]
        p += 2
        code, ln = th >> 6, th & 0x3F
        if ln == 0x3F:
            ln = struct.unpack_from("<I", body, p)[0]
            p += 4
        seg = body[p:p + ln]
        p += ln
        if code != 75:
            continue
        q = 2
        flags = seg[q]
        q += 2
        nl = seg[q]
        q += 1
        name = seg[q:q + nl].rstrip(b"\x00").decode("cp1252", "replace")
        q += nl
        n = struct.unpack_from("<H", seg, q)[0]
        q += 2
        wide_off, wide_codes = bool(flags & 0x08), bool(flags & 0x04)
        offsets = struct.unpack_from("<%d%s" % (n + 1, "I" if wide_off else "H"), seg, q)
        codes = struct.unpack_from("<%d%s" % (n, "H" if wide_codes else "B"),
                                   seg, q + offsets[n])
        out[name] = {chr(c) for c in codes}
    return out


def coverage(hand=False):
    global _COVER
    if not _COVER:
        _COVER = _read_coverage()
    if not _COVER:
        # запасной минимум, если шрифт не найден
        base = set(" abcdefghijklmnopqrstuvxyz")
        return base if hand else base | set(
            " !?.,:;'\"()-0123456789ABCDEFGHIJKLMNOPQRSTUVXYZ")
    for name, chars in _COVER.items():
        if ("Hand" in name) == bool(hand):
            return chars
    return next(iter(_COVER.values()))


def covers(ch, hand=False):
    return ch in coverage(hand)


# ---------------------------------------------------------------------- #

# Невидимая типографика: при копировании из браузера между буквами часто
# оказываются тонкие и волосяные пробелы. Глифов для них нет ни в EVA, ни в
# книжном шрифте игры — движок рисует чёрные квадраты. Вырезаем.
INVISIBLE = (list(range(0x2000, 0x200C))   # от en-пробела до волосяного, ZWSP, ZWNJ
             + [0x200E, 0x200F, 0x202F, 0x205F, 0x2060, 0xFEFF, 0x00AD, 0x180E])
_TRANSLATE = {cp: None for cp in INVISIBLE}
_TRANSLATE[0x00A0] = " "      # неразрывный пробел из источника — обычный пробел


def sanitize(text):
    """Убрать невидимые разделители и заменить то, чему нет глифа."""
    return text.translate(_TRANSLATE)


def to_eva(text, hand=False):
    """Английский -> текст для игры. Возвращает (строка, непокрытые символы)."""
    src = sanitize(text).replace("\r\n", "\n")
    out, missing = [], []
    i, n = 0, len(src)
    while i < n:
        ch = src[i]
        if ch == "w":
            out.append("vv")
            i += 1
            continue
        if ch == "W":
            out.append("VV")
            i += 1
            continue
        if ch in "vV" and i + 1 < n and src[i + 1] == ch:
            # настоящая пара v — разводим, иначе прочтётся как w
            out.append(ch + ESCAPE + ch)
            i += 2
            continue
        if ch not in "\n\t" and not covers(ch, hand) and ch not in missing:
            missing.append(ch)
        out.append(ch)
        i += 1
    return "".join(out), missing


def from_eva(text):
    """Текст из игры -> английский."""
    out = (text.replace("v" + ESCAPE + "v", "\x00")
               .replace("V" + ESCAPE + "V", "\x01"))
    out = out.replace("vv", "w").replace("VV", "W")
    return out.replace("\x00", "vv").replace("\x01", "VV")


def unsupported_report(text, hand=False):
    """Символы текста, которых в шрифте нет — уйдут обычным книжным шрифтом."""
    return to_eva(text, hand)[1]


def is_eva(ch, hand=False):
    """Символ рисуется шрифтом Войнича — для разбиения текста на прогоны."""
    return ch not in "\n\r" and (ch == ESCAPE or covers(ch, hand))
