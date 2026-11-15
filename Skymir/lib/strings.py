"""Строковые таблицы локализации: .STRINGS / .DLSTRINGS / .ILSTRINGS.

У локализованных плагинов (все ванильные .esm) поля FULL и DESC хранят не
текст, а 32-битный идентификатор строки. Сам текст — здесь.
  .STRINGS   — короткие строки (названия), нуль-терминированные
  .DLSTRINGS — длинные (описания книг), с префиксом длины
  .ILSTRINGS — реплики
"""

import os
import struct

from . import bsa

LANGUAGES = ('russian', 'english', 'german', 'french', 'spanish',
             'italian', 'polish', 'japanese', 'chinese', 'czech')


def parse(data, prefixed):
    """Разобрать таблицу в dict {id: text}."""
    count, data_size = struct.unpack_from('<II', data, 0)
    dir_end = 8 + count * 8
    out = {}
    for i in range(count):
        sid, offset = struct.unpack_from('<II', data, 8 + i * 8)
        pos = dir_end + offset
        if pos >= len(data):
            continue
        if prefixed:
            length = struct.unpack_from('<I', data, pos)[0]
            raw = data[pos + 4:pos + 4 + length]
        else:
            end = data.index(b'\x00', pos)
            raw = data[pos:end]
        out[sid] = decode(raw.rstrip(b'\x00'))
    return out


def decode(raw):
    for enc in ('utf-8', 'cp1251', 'cp1252'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('cp1251', 'replace')


class StringTables:
    """Три таблицы для одного плагина на одном языке."""

    def __init__(self, stem, language, data_dir):
        self.stem = stem
        self.language = language
        self.source = None
        self.strings = {}
        self.dlstrings = {}
        self.ilstrings = {}
        self._load(data_dir)

    def _load(self, data_dir):
        for ext, target, prefixed in (('strings', 'strings', False),
                                      ('dlstrings', 'dlstrings', True),
                                      ('ilstrings', 'ilstrings', True)):
            name = '%s_%s.%s' % (self.stem.lower(), self.language, ext)
            data = None
            loose = os.path.join(data_dir, 'Strings', name)
            if os.path.isfile(loose):
                with open(loose, 'rb') as f:
                    data = f.read()
                self.source = self.source or 'Data\\Strings'
            else:
                data, arch = bsa.locate(data_dir, 'strings/' + name, hint=self.stem)
                if data is not None:
                    self.source = self.source or arch
            if data:
                try:
                    setattr(self, target, parse(data, prefixed))
                except Exception:
                    pass

    def ok(self):
        return bool(self.strings or self.dlstrings or self.ilstrings)

    def get(self, sid, kind='dl'):
        if kind == 'dl':
            order = (self.dlstrings, self.strings, self.ilstrings)
        elif kind == 'il':
            order = (self.ilstrings, self.dlstrings, self.strings)
        else:
            order = (self.strings, self.dlstrings, self.ilstrings)
        for table in order:
            if sid in table:
                return table[sid]
        return None


def detect_language(data_dir, stem='skyrim'):
    """Определить язык установки по наличию строковых таблиц."""
    loose = os.path.join(data_dir, 'Strings')
    if os.path.isdir(loose):
        for name in os.listdir(loose):
            low = name.lower()
            for lang in LANGUAGES:
                if low.startswith(stem.lower() + '_') and lang in low:
                    return lang
    data, _ = bsa.locate(data_dir, 'strings/%s_russian.strings' % stem.lower(),
                         hint='interface')
    if data:
        return 'russian'
    return 'english'
