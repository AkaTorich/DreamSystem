# -*- coding: utf-8 -*-
"""Генератор .esp с книгами для Skyrim SE (без Creation Kit)."""
import struct

FORM_VERSION = 44

def _sub(sig, data):
    assert len(data) <= 0xFFFF, "субзапись слишком велика"
    return sig.encode("ascii") + struct.pack("<H", len(data)) + data

def _zstr(s, enc="utf-8"):
    return s.encode(enc) + b"\x00"

def _record(sig, formid, subrecords, flags=0):
    data = b"".join(subrecords)
    return (sig.encode("ascii") + struct.pack("<IIIHHHH", len(data), flags, formid,
            0, 0, FORM_VERSION, 0) + data)

def _grup(label, records):
    data = b"".join(records)
    return (b"GRUP" + struct.pack("<I", len(data) + 24) + label.encode("ascii") +
            struct.pack("<iHHI", 0, 0, 0, 0) + data)

# слепок ванильной книги CR12TotemsOfHircine (Skyrim.esm) — модель, хэши текстур,
# ключевое слово VendorItemBook и модель раскрытой книги (INAM)
MODT = bytes.fromhex(
    "0200000004000000000000002aea086e64647300b5139f0982a49db864647300"
    "b5139f09cd6472c964647300b5139f09f4c8a2a364647300b5139f09")

def book_record(formid, edid, title, text):
    """Одна запись BOOK; без INAM игра вылетает при открытии книги."""
    subs = [
        _sub("EDID", _zstr(edid, "ascii")),
        _sub("OBND", b"\x00" * 12),
        _sub("FULL", _zstr(title)),
        _sub("MODL", _zstr("Clutter\\Books\\Book02LowPoly02.nif", "cp1252")),
        _sub("MODT", MODT),
        _sub("DESC", _zstr(text)),
        _sub("KSIZ", struct.pack("<I", 1)),
        _sub("KWDA", struct.pack("<I", 0x000937A2)),   # VendorItemBook
        _sub("DATA", struct.pack("<BBHIIf", 0, 0, 0, 0, 30, 1.0)),
        _sub("INAM", struct.pack("<I", 0x0008ADAE)),   # открытая книга (экран чтения)
        _sub("CNAM", struct.pack("<I", 0)),
    ]
    return _record("BOOK", formid, subs)

def build_esp(books, author="HieroBooks"):
    """books: список словарей {edid, title, text}; текст — готовая разметка книги."""
    book_records = []
    for i, b in enumerate(books):
        formid = 0x01000800 + b.get("index", i)
        book_records.append(book_record(formid, b["edid"], b["title"], b["text"]))

    tes4_subs = [
        _sub("HEDR", struct.pack("<fII", 1.70, 1 + len(books), 0x800 + len(books) + 1)),
        _sub("CNAM", _zstr(author, "cp1252")),
        _sub("MAST", _zstr("Skyrim.esm", "cp1252")),
        _sub("DATA", struct.pack("<Q", 0)),
    ]
    tes4 = _record("TES4", 0, tes4_subs)
    return tes4 + _grup("BOOK", book_records)

def save_esp(path, books, author="HieroBooks"):
    with open(path, "wb") as f:
        f.write(build_esp(books, author))
