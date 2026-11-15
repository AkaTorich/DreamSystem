"""Парсер плагинов TES5/SSE (.esm/.esp/.esl) и извлечение записей BOOK.

Формат: дерево групп GRUP, внутри — записи по 24 байта заголовка, тело
делится на сабрекорды (тип 4 байта + размер uint16). Записи могут быть
сжаты zlib (флаг 0x00040000). У локализованных плагинов текст книги лежит
в отдельной строковой таблице, тут — только id строки.
"""

import os
import struct
import zlib

from . import strings as strmod

REC_HEADER = 24
FLAG_COMPRESSED = 0x00040000
FLAG_LOCALIZED = 0x00000080
FLAG_ESL = 0x00000200

BOOK_FLAG_SKILL = 0x01
BOOK_FLAG_READ = 0x02
BOOK_FLAG_SPELL = 0x04


def zstring(raw):
    return strmod.decode(raw.split(b'\x00', 1)[0])


class Subrecords:
    """Плоский разбор тела записи на сабрекорды, с учётом XXXX."""

    @staticmethod
    def iter(data):
        pos = 0
        n = len(data)
        override = None
        while pos + 6 <= n:
            sig = data[pos:pos + 4]
            size = struct.unpack_from('<H', data, pos + 4)[0]
            pos += 6
            if sig == b'XXXX':
                override = struct.unpack_from('<I', data, pos)[0]
                pos += size
                continue
            if override is not None:
                size = override
                override = None
            yield sig, data[pos:pos + size]
            pos += size


class Book:
    __slots__ = ('plugin', 'form_id', 'editor_id', 'title', 'text',
                 'value', 'weight', 'flags', 'book_type', 'skill',
                 'model', 'inventory_art')

    def __init__(self):
        self.plugin = ''
        self.form_id = 0
        self.editor_id = ''
        self.title = ''
        self.text = ''
        self.value = 0
        self.weight = 0.0
        self.flags = 0
        self.book_type = 0
        self.skill = -1
        self.model = ''
        self.inventory_art = 0

    @property
    def key(self):
        return '%s:%06X' % (self.plugin, self.form_id & 0xFFFFFF)

    @property
    def is_note(self):
        # Заметки и письма отличаются от книг типом модели.
        low = self.model.lower()
        return 'note' in low or 'scroll' in low

    def to_dict(self):
        return {
            'key': self.key,
            'plugin': self.plugin,
            'form_id': '%08X' % self.form_id,
            'editor_id': self.editor_id,
            'title': self.title,
            'text': self.text,
            'value': self.value,
            'weight': self.weight,
            'teaches_skill': bool(self.flags & BOOK_FLAG_SKILL),
            'teaches_spell': bool(self.flags & BOOK_FLAG_SPELL),
            'model': self.model,
            'chars': len(self.text),
        }


class Plugin:
    def __init__(self, path, data_dir=None, language=None):
        self.path = path
        self.name = os.path.basename(path)
        self.stem = os.path.splitext(self.name)[0]
        self.data_dir = data_dir or os.path.dirname(path)
        self.masters = []
        self.localized = False
        self.is_esl = False
        self.author = ''
        self.description = ''
        self._tables = None
        self._language = language
        self._raw = None

    # ------------------------------------------------------------------ #

    def load(self):
        with open(self.path, 'rb') as f:
            self._raw = f.read()
        self._read_header()
        return self

    def _read_header(self):
        data = self._raw
        if data[:4] != b'TES4':
            raise ValueError('%s: не плагин Bethesda' % self.name)
        size, flags = struct.unpack_from('<II', data, 4)
        self.localized = bool(flags & FLAG_LOCALIZED)
        self.is_esl = bool(flags & FLAG_ESL)
        body = data[REC_HEADER:REC_HEADER + size]
        for sig, payload in Subrecords.iter(body):
            if sig == b'MAST':
                self.masters.append(zstring(payload))
            elif sig == b'CNAM':
                self.author = zstring(payload)
            elif sig == b'SNAM':
                self.description = zstring(payload)

    # ------------------------------------------------------------------ #

    def tables(self):
        if self._tables is None and self.localized:
            lang = self._language or strmod.detect_language(self.data_dir, self.stem)
            self._tables = strmod.StringTables(self.stem, lang, self.data_dir)
            if not self._tables.ok() and lang != 'english':
                fallback = strmod.StringTables(self.stem, 'english', self.data_dir)
                if fallback.ok():
                    self._tables = fallback
        return self._tables

    def _lstring(self, payload, kind='dl'):
        if not self.localized:
            return zstring(payload)
        if len(payload) < 4:
            return ''
        sid = struct.unpack_from('<I', payload, 0)[0]
        tables = self.tables()
        if tables is None:
            return '<string %08X>' % sid
        value = tables.get(sid, kind)
        return value if value is not None else '<string %08X>' % sid

    # ------------------------------------------------------------------ #

    def iter_records(self, wanted=b'BOOK'):
        """Обход дерева групп без рекурсии: интересует только один тип."""
        data = self._raw
        n = len(data)
        # Пропускаем запись TES4.
        pos = REC_HEADER + struct.unpack_from('<I', data, 4)[0]
        stack = [n]
        while pos + REC_HEADER <= n:
            sig = data[pos:pos + 4]
            size = struct.unpack_from('<I', data, pos + 4)[0]
            if sig == b'GRUP':
                label = data[pos + 8:pos + 12]
                group_type = struct.unpack_from('<i', data, pos + 12)[0]
                # Группа верхнего уровня чужого типа — перепрыгиваем целиком.
                if group_type == 0 and label != wanted:
                    pos += size
                    continue
                stack.append(pos + size)
                pos += REC_HEADER
                continue

            flags, form_id = struct.unpack_from('<II', data, pos + 8)
            body_start = pos + REC_HEADER
            if sig == wanted:
                body = data[body_start:body_start + size]
                if flags & FLAG_COMPRESSED:
                    try:
                        body = zlib.decompress(body[4:])
                    except zlib.error:
                        body = b''
                yield form_id, flags, body
            pos = body_start + size
            while stack and pos >= stack[-1]:
                stack.pop()

    # ------------------------------------------------------------------ #

    def books(self):
        out = []
        for form_id, _flags, body in self.iter_records(b'BOOK'):
            book = Book()
            book.plugin = self.name
            book.form_id = form_id
            for sig, payload in Subrecords.iter(body):
                if sig == b'EDID':
                    book.editor_id = zstring(payload)
                elif sig == b'FULL':
                    book.title = self._lstring(payload, 'str')
                elif sig == b'DESC':
                    book.text = self._lstring(payload, 'dl')
                elif sig == b'MODL':
                    book.model = zstring(payload)
                elif sig == b'DATA' and len(payload) >= 16:
                    (bflags, btype, _unk, skill, value, weight) = \
                        struct.unpack_from('<BBhiIf', payload, 0)
                    book.flags = bflags
                    book.book_type = btype
                    book.skill = skill
                    book.value = value
                    book.weight = weight
                elif sig == b'INAM' and len(payload) >= 4:
                    book.inventory_art = struct.unpack_from('<I', payload, 0)[0]
            out.append(book)
        return out


def load_books(paths, data_dir, language=None, progress=None):
    """Собрать книги из списка плагинов. Возвращает (список книг, отчёт)."""
    books = []
    report = []
    for path in paths:
        try:
            plugin = Plugin(path, data_dir, language).load()
            found = plugin.books()
            books.extend(found)
            tab = plugin.tables()
            report.append({
                'plugin': plugin.name,
                'books': len(found),
                'localized': plugin.localized,
                'strings_from': tab.source if tab else None,
                'language': tab.language if tab else None,
            })
        except Exception as exc:
            report.append({'plugin': os.path.basename(path), 'error': str(exc)})
        if progress:
            progress(os.path.basename(path), len(books))
    return books, report
