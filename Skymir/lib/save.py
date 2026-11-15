"""Разбор сейвов Skyrim (.ess) и ко-сейвов SKSE (.skse).

Важно понимать, что в сейве нет текстов книг: текст живёт в плагине, а сейв
хранит лишь изменённые формы (ChangeForm). Прочитанная книга оставляет там
след — по нему и сверяемся со списком книг из плагинов.

Тексты, сочинённые модом прямо в игре (дневники, заметки игрока), лежат в
ко-сейве .skse строками Papyrus — их достаём эвристическим сканом.
"""

import os
import struct
import zlib

from . import lz4
from . import strings as strmod

MAGIC = b'TESV_SAVEGAME'


class Reader:
    def __init__(self, data, pos=0):
        self.d = data
        self.p = pos

    def u8(self):
        v = self.d[self.p]
        self.p += 1
        return v

    def u16(self):
        v = struct.unpack_from('<H', self.d, self.p)[0]
        self.p += 2
        return v

    def u32(self):
        v = struct.unpack_from('<I', self.d, self.p)[0]
        self.p += 4
        return v

    def u64(self):
        v = struct.unpack_from('<Q', self.d, self.p)[0]
        self.p += 8
        return v

    def f32(self):
        v = struct.unpack_from('<f', self.d, self.p)[0]
        self.p += 4
        return v

    def wstring(self):
        n = self.u16()
        raw = self.d[self.p:self.p + n]
        self.p += n
        return strmod.decode(raw)

    def vsval(self):
        """Число переменной длины: младшие 2 бита — размер."""
        first = self.d[self.p]
        size = first & 0x3
        if size == 0:
            self.p += 1
            return first >> 2
        if size == 1:
            v = struct.unpack_from('<H', self.d, self.p)[0]
            self.p += 2
            return v >> 2
        v = struct.unpack_from('<I', self.d, self.p)[0]
        self.p += 4
        return v >> 2

    def refid(self):
        b0, b1, b2 = self.d[self.p], self.d[self.p + 1], self.d[self.p + 2]
        self.p += 3
        return (b0 >> 6), ((b0 & 0x3F) << 16) | (b1 << 8) | b2

    def skip(self, n):
        self.p += n


class Save:
    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(path)
        self.header = {}
        self.plugins = []
        self.light_plugins = []
        self.change_forms = []   # (resolved_formid|None, raw_type, raw_value, form_type, flags)
        self.form_ids = []
        self.errors = []

    # ------------------------------------------------------------------ #

    def load(self):
        with open(self.path, 'rb') as f:
            raw = f.read()
        if raw[:13] != MAGIC:
            raise ValueError('%s: не сейв Skyrim' % self.name)

        r = Reader(raw, 13)
        header_size = r.u32()
        h = Reader(raw, r.p)
        version = h.u32()
        self.header = {
            'version': version,
            'save_number': h.u32(),
            'player': h.wstring(),
            'level': h.u32(),
            'location': h.wstring(),
            'game_date': h.wstring(),
            'race': h.wstring(),
            'sex': ('мужской', 'женский')[min(h.u16(), 1)],
        }
        self.header['exp'] = h.f32()
        self.header['exp_needed'] = h.f32()
        filetime = h.u64()
        self.header['saved_at'] = _filetime(filetime)
        width = h.u32()
        height = h.u32()
        compression = h.u16() if version >= 12 else 0
        self.header['screenshot'] = '%dx%d' % (width, height)
        self.header['compression'] = ('нет', 'zlib', 'lz4')[min(compression, 2)]

        pos = 13 + 4 + header_size
        pixel = 4 if version >= 12 else 3
        pos += width * height * pixel

        if compression:
            _uncompressed_len = struct.unpack_from('<I', raw, pos)[0]
            compressed_len = struct.unpack_from('<I', raw, pos + 4)[0]
            blob = raw[pos + 8:pos + 8 + compressed_len]
            body = lz4.decompress(blob) if compression == 2 else zlib.decompress(blob)
            body_origin = pos  # для калибровки смещений
        else:
            body = raw[pos:]
            body_origin = pos

        self._parse_body(body, body_origin)
        return self

    # ------------------------------------------------------------------ #

    def _parse_body(self, body, body_origin):
        r = Reader(body, 0)
        form_version = r.u8()
        self.header['form_version'] = form_version

        # Блок pluginInfoSize охватывает и обычные плагины, и лёгкие (ESL).
        plugin_info_size = r.u32()
        after = r.p + plugin_info_size
        count = r.u8()
        for _ in range(count):
            self.plugins.append(r.wstring())
        if form_version >= 78 and r.p < after:
            light_count = r.u16()
            for _ in range(light_count):
                if r.p >= after:
                    break
                self.light_plugins.append(r.wstring())
        r.p = after

        table = [r.u32() for _ in range(10)]
        r.skip(15 * 4)
        (form_id_array_offset, _unknown3_offset, gd1_offset, gd2_offset,
         change_forms_offset, gd3_offset, gd1_count, gd2_count,
         gd3_count, change_form_count) = table

        # Смещения в таблице абсолютные — для файла целиком, а тело у нас
        # вырезано и разжато. Якорь: сразу за таблицей начинается globalData1.
        delta = r.p - gd1_offset
        r.p = change_forms_offset + delta

        # Размер полей длины задают два старших бита байта типа.
        size_of = {0: r.u8, 1: r.u16, 2: r.u32, 3: r.u32}
        for _ in range(change_form_count):
            try:
                rtype, value = r.refid()
                flags = r.u32()
                raw_type = r.u8()
                r.u8()                    # версия записи
                read_len = size_of[raw_type >> 6]
                length1 = read_len()
                length2 = read_len()
                r.skip(length1)
                self.change_forms.append(
                    (rtype, value, raw_type & 0x3F, flags, length2))
            except (IndexError, KeyError, struct.error):
                self.errors.append('ChangeForms оборвались на %d из %d'
                                   % (len(self.change_forms), change_form_count))
                break

        # Массив FormID — по калиброванному смещению.
        try:
            fr = Reader(body, form_id_array_offset + delta)
            n = fr.u32()
            if 0 <= n < 5_000_000:
                self.form_ids = list(struct.unpack_from('<%dI' % n, body, fr.p))
        except (IndexError, struct.error):
            self.errors.append('не удалось прочитать массив FormID')

    # ------------------------------------------------------------------ #

    def resolve(self, rtype, value):
        """Превратить refID в настоящий FormID."""
        if rtype == 0:
            idx = value - 1
            if 0 <= idx < len(self.form_ids):
                return self.form_ids[idx]
            return None
        if rtype == 2:
            return 0xFF000000 | value
        return value

    def touched_form_ids(self):
        out = set()
        for rtype, value, _ft, _fl, _l2 in self.change_forms:
            fid = self.resolve(rtype, value)
            if fid is not None:
                out.add(fid)
        return out

    def plugin_for(self, form_id):
        """Имя плагина по FormID с учётом лёгких (FE xxx) индексов."""
        high = form_id >> 24
        if high == 0xFE:
            idx = (form_id >> 12) & 0xFFF
            if idx < len(self.light_plugins):
                return self.light_plugins[idx], form_id & 0xFFF
            return None, form_id & 0xFFF
        if high < len(self.plugins):
            return self.plugins[high], form_id & 0xFFFFFF
        return None, form_id & 0xFFFFFF

    def summary(self):
        return {
            'file': self.name,
            **self.header,
            'plugins': len(self.plugins),
            'light_plugins': len(self.light_plugins),
            'change_forms': len(self.change_forms),
            'form_ids': len(self.form_ids),
            'errors': self.errors,
        }


def _filetime(ft):
    """Windows FILETIME -> строка."""
    import datetime
    if not ft:
        return ''
    try:
        epoch = datetime.datetime(1601, 1, 1)
        return (epoch + datetime.timedelta(microseconds=ft // 10)).strftime('%Y-%m-%d %H:%M')
    except (OverflowError, OSError, ValueError):
        return ''


# ---------------------------------------------------------------------- #
#  Ко-сейв SKSE: тексты, сочинённые модами в рантайме
# ---------------------------------------------------------------------- #

def cosave_strings(path, min_len=12):
    """Вытащить строки из .skse. Эвристика: сначала длина-префикс, потом скан.

    Формат чанков у каждого плагина SKSE свой, поэтому надёжнее собрать все
    осмысленные строковые последовательности и отфильтровать шум.
    """
    with open(path, 'rb') as f:
        data = f.read()

    found = []
    seen = set()

    # 1. Строки с 16-битным префиксом длины — так их пишет Papyrus.
    i = 0
    n = len(data)
    while i + 2 < n:
        ln = struct.unpack_from('<H', data, i)[0]
        if min_len <= ln <= 8192 and i + 2 + ln <= n:
            chunk = data[i + 2:i + 2 + ln]
            if _texty(chunk):
                s = strmod.decode(chunk)
                if s not in seen:
                    seen.add(s)
                    found.append(s)
                i += 2 + ln
                continue
        i += 1

    # 2. Добор: просто длинные читаемые последовательности.
    run = bytearray()
    for b in data:
        if 0x20 <= b < 0x7F or b >= 0xC0 or b in (0x0A, 0x0D, 0x09):
            run.append(b)
        else:
            if len(run) >= min_len:
                s = strmod.decode(bytes(run))
                if _texty(run) and s not in seen:
                    seen.add(s)
                    found.append(s)
            run = bytearray()
    return found


def _texty(chunk):
    """Отсеять бинарный мусор: доля букв и пробелов должна быть высокой."""
    if not chunk:
        return False
    good = sum(1 for b in chunk
               if 0x20 <= b < 0x7F or b >= 0xC0 or b in (0x0A, 0x0D))
    if good / len(chunk) < 0.9:
        return False
    letters = sum(1 for b in chunk if (0x41 <= b <= 0x5A) or (0x61 <= b <= 0x7A) or b >= 0xC0)
    return letters >= len(chunk) * 0.5
