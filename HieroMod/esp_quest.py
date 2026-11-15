# -*- coding: utf-8 -*-
"""Генератор HieroBooks.esp с квестом «Перевод папирусов».

Помимо книг (esp_book.book_record) пишет квест, диалог супруга/супруги,
формлисты пар «папирус — перевод» и глобальную переменную состояния.
Форматы записей сверены с xEdit (wbDefinitionsTES5) и байтами Skyrim.esm.
"""
import struct
from esp_book import _sub, _zstr, _record, book_record, FORM_VERSION

# FormID внутри esp (индекс 01 — единственный мастер Skyrim.esm)
FID = 0x01000000
GLOB_STATE   = FID | 0x600
FLST_ORIG    = FID | 0x601
FLST_TRANS   = FID | 0x602
QUST_ID      = FID | 0x603
DLBR_GIVE, DLBR_WAIT, DLBR_TAKE = FID | 0x604, FID | 0x60B, FID | 0x60C
DIAL_GIVE, DIAL_WAIT, DIAL_TAKE = FID | 0x605, FID | 0x606, FID | 0x607
INFO_GIVE, INFO_WAIT, INFO_TAKE = FID | 0x608, FID | 0x609, FID | 0x60A
BOOK_BASE, TRANS_BASE = 0x800, 0x1000

MARRIED_FACTION = 0x000C6472   # PlayerMarriedFaction (Skyrim.esm)
PLAYER_REF = 0x00000014

# ---------- VMAD ----------
def _wstr(s):
    b = s.encode("utf-8")
    return struct.pack("<H", len(b)) + b

def _vmad(scripts, fragments=None):
    """scripts: [(имя, [(свойство, formid), ...]), ...]; свойства-объекты.
    fragments: имя скрипта-фрагмента INFO (Fragment_0, OnEnd)."""
    out = struct.pack("<hhH", 5, 2, len(scripts))
    for name, props in sorted(scripts):
        out += _wstr(name) + b"\x00" + struct.pack("<H", len(props))
        for pname, formid in sorted(props):
            # тип 1 (Object), флаг 1 (Edited); объект v2: unused, alias=-1, formid
            out += _wstr(pname) + bytes((1, 1)) + struct.pack("<Hhi", 0, -1, formid)
    if fragments:
        out += b"\x02\x02" + _wstr(fragments)            # unknown=2, флаг 2 = OnEnd
        out += b"\x01" + _wstr(fragments) + _wstr("Fragment_0")
    return out

# ---------- условия ----------
EQ, GE = 0, 3   # операторы сравнения (старшие 3 бита первого байта CTDA)

def _ctda(func, comp, p1, p2=0, op=EQ, runon=0, ref=0):
    return _sub("CTDA", struct.pack("<B3xfH2xIIIIi",
                op << 5, comp, func, p1, p2, runon, ref, -1))

def _cond_spouse():                      # собеседник — супруг(а) игрока
    return _ctda(71, 1.0, MARRIED_FACTION)               # GetInFaction

def _cond_state(v):                      # состояние заказа
    return _ctda(74, float(v), GLOB_STATE)               # GetGlobalValue

def _cond_has_original():                # у игрока есть папирус из списка
    return _ctda(47, 1.0, FLST_ORIG, op=GE, runon=2, ref=PLAYER_REF)  # GetItemCount

# ---------- записи ----------
def _glob_state():
    return _record("GLOB", GLOB_STATE, [
        _sub("EDID", _zstr("HB_State", "ascii")),
        _sub("FNAM", b"s"),
        _sub("FLTV", struct.pack("<f", 0.0)),
    ])

def _flst(formid, edid, formids):
    subs = [_sub("EDID", _zstr(edid, "ascii"))]
    subs += [_sub("LNAM", struct.pack("<I", f)) for f in formids]
    return _record("FLST", formid, subs)

def _qust():
    vmad = _vmad([("HB_TransQuestScript", [
        ("HB_Originals", FLST_ORIG),
        ("HB_State", GLOB_STATE),
        ("HB_Translations", FLST_TRANS),
    ])])
    return _record("QUST", QUST_ID, [
        _sub("EDID", _zstr("HB_TransQuest", "ascii")),
        _sub("VMAD", vmad),
        _sub("FULL", _zstr("Перевод папирусов")),
        # флаг 1 — Start Game Enabled; приоритет 70
        _sub("DNAM", struct.pack("<HBB4xI", 0x0001, 70, 0, 0)),
        _sub("NEXT", b""),
        _sub("ANAM", struct.pack("<I", 0)),
    ])

def _dlbr(formid, edid, dial):
    return _record("DLBR", formid, [
        _sub("EDID", _zstr(edid, "ascii")),
        _sub("QNAM", struct.pack("<I", QUST_ID)),
        _sub("TNAM", struct.pack("<I", 0)),
        _sub("DNAM", struct.pack("<I", 1)),              # Top-Level
        _sub("SNAM", struct.pack("<I", dial)),
    ])

def _dial(formid, edid, branch, player_line):
    return _record("DIAL", formid, [
        _sub("EDID", _zstr(edid, "ascii")),
        _sub("FULL", _zstr(player_line)),
        _sub("PNAM", struct.pack("<f", 50.0)),
        _sub("BNAM", struct.pack("<I", branch)),
        _sub("QNAM", struct.pack("<I", QUST_ID)),
        _sub("DATA", struct.pack("<BBH", 0, 0, 0)),      # Topic / Custom
        _sub("SNAM", b"CUST"),
        _sub("TIFC", struct.pack("<I", 1)),
    ])

def _info(formid, response, conditions, fragment=None, goodbye=False):
    subs = []
    if fragment:
        subs.append(_sub("VMAD", _vmad([(fragment, [("QuestScript", QUST_ID)])],
                                       fragments=fragment)))
    flags = 0x0200 | (0x0001 if goodbye else 0)          # Force subtitle (+Goodbye)
    subs.append(_sub("ENAM", struct.pack("<HH", flags, 0)))
    subs.append(_sub("PNAM", struct.pack("<I", 0)))
    subs.append(_sub("TRDT", struct.pack("<IIIB3xIB3x", 0, 50, 0, 1, 0, 0)))
    subs.append(_sub("NAM1", _zstr(response)))
    subs += conditions
    return _record("INFO", formid, subs)

def _grup_top(label, records):
    data = b"".join(records)
    return (b"GRUP" + struct.pack("<I", len(data) + 24) + label.encode("ascii") +
            struct.pack("<iHHI", 0, 0, 0, 0) + data)

def _grup_children(dial_formid, records):
    data = b"".join(records)
    return (b"GRUP" + struct.pack("<II", len(data) + 24, dial_formid) +
            struct.pack("<iHHI", 7, 0, 0, 0) + data)

# ---------- сборка ----------
def build_esp(books, pairs, author="HieroBooks"):
    """books: [{num, edid, title, text}] — все книги (разметка готова).
    pairs: [{num, edid, title, text}] — книги-переводы; num совпадает с оригиналом."""
    recs_books = [book_record(FID | (BOOK_BASE + b["num"] - 1),
                              b["edid"], b["title"], b["text"]) for b in books]
    recs_trans = [book_record(FID | (TRANS_BASE + p["num"] - 1),
                              p["edid"], p["title"], p["text"]) for p in pairs]
    nums = sorted(p["num"] for p in pairs)
    orig_ids  = [FID | (BOOK_BASE + n - 1) for n in nums]
    trans_ids = [FID | (TRANS_BASE + n - 1) for n in nums]

    dial_give = _dial(DIAL_GIVE, "HB_TopicGive", DLBR_GIVE, "Переведёшь этот папирус?")
    dial_wait = _dial(DIAL_WAIT, "HB_TopicWait", DLBR_WAIT, "Как продвигается перевод?")
    dial_take = _dial(DIAL_TAKE, "HB_TopicTake", DLBR_TAKE, "Перевод готов?")
    info_give = _info(INFO_GIVE,
        "Хм, знаки древних... Оставь мне свиток. Через час перевод будет готов.",
        [_cond_spouse(), _cond_state(0), _cond_has_original()], fragment="HB_TIF_Give")
    info_wait = _info(INFO_WAIT,
        "Терпение, я ещё вожусь со знаками. Зайди чуть позже.",
        [_cond_spouse(), _cond_state(1)])
    info_take = _info(INFO_TAKE,
        "Готово. Вот твой перевод — занятное вышло чтение.",
        [_cond_spouse(), _cond_state(2)], fragment="HB_TIF_Take", goodbye=True)

    groups = [
        _grup_top("GLOB", [_glob_state()]),
        _grup_top("BOOK", recs_books + recs_trans),
        _grup_top("FLST", [_flst(FLST_ORIG, "HB_Originals", orig_ids),
                           _flst(FLST_TRANS, "HB_Translations", trans_ids)]),
        _grup_top("QUST", [_qust()]),
        _grup_top("DLBR", [_dlbr(DLBR_GIVE, "HB_BranchGive", DIAL_GIVE),
                           _dlbr(DLBR_WAIT, "HB_BranchWait", DIAL_WAIT),
                           _dlbr(DLBR_TAKE, "HB_BranchTake", DIAL_TAKE)]),
        _grup_top("DIAL", [dial_give, _grup_children(DIAL_GIVE, [info_give]),
                           dial_wait, _grup_children(DIAL_WAIT, [info_wait]),
                           dial_take, _grup_children(DIAL_TAKE, [info_take])]),
    ]

    n_records = 1 + len(recs_books) + len(recs_trans) + 12
    tes4 = _record("TES4", 0, [
        _sub("HEDR", struct.pack("<fII", 1.70, n_records, 0x2000)),
        _sub("CNAM", _zstr(author, "cp1252")),
        _sub("MAST", _zstr("Skyrim.esm", "cp1252")),
        _sub("DATA", struct.pack("<Q", 0)),
    ])
    return tes4 + b"".join(groups)

def save_esp(path, books, pairs, author="HieroBooks"):
    with open(path, "wb") as f:
        f.write(build_esp(books, pairs, author))

def save_seq(path):
    """SEQ-файл: без него start-game-enabled квест не стартует в SE."""
    with open(path, "wb") as f:
        f.write(struct.pack("<I", QUST_ID))
