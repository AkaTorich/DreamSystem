"""Читалка архивов Bethesda (.bsa), версии 104 (Skyrim LE) и 105 (SSE).

Нужна затем, что в SSE строковые таблицы (тексты книг для локализованных
плагинов) лежат не отдельными файлами, а внутри `Skyrim - Interface.bsa`.
"""

import os
import struct
import zlib

from . import lz4

FLAG_DIR_NAMES = 0x1
FLAG_FILE_NAMES = 0x2
FLAG_COMPRESSED = 0x4
FLAG_EMBED_NAMES = 0x100

COMPRESSION_TOGGLE = 0x40000000


class BSAError(Exception):
    pass


class BSA:
    """Ленивый доступ: таблицы читаются сразу, данные файлов — по запросу."""

    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(path)
        self.files = {}  # 'strings/skyrim_russian.dlstrings' -> (offset, size, compressed)
        self._read_tables()

    # ------------------------------------------------------------------ #

    def _read_tables(self):
        with open(self.path, 'rb') as f:
            head = f.read(36)
            if head[:4] != b'BSA\x00':
                raise BSAError('%s: не BSA-архив' % self.name)
            (self.version, folder_offset, self.flags, folder_count,
             file_count, _tot_dir_len, _tot_file_len,
             self.file_flags, _pad) = struct.unpack_from('<IIIIIIIHH', head, 4)

            if self.version not in (103, 104, 105):
                raise BSAError('%s: версия %d не поддерживается'
                               % (self.name, self.version))

            self.default_compressed = bool(self.flags & FLAG_COMPRESSED)
            self.embed_names = bool(self.flags & FLAG_EMBED_NAMES)

            f.seek(folder_offset)
            rec_size = 24 if self.version >= 105 else 16
            raw = f.read(rec_size * folder_count)
            folders = []
            for i in range(folder_count):
                base = i * rec_size
                if self.version >= 105:
                    _hash, count, _unk, offset = struct.unpack_from('<QIIQ', raw, base)
                else:
                    _hash, count, offset = struct.unpack_from('<QII', raw, base)
                folders.append((count, offset))

            # Блок имён папок вперемешку со списками файлов.
            entries = []
            for count, _offset in folders:
                if self.flags & FLAG_DIR_NAMES:
                    ln = f.read(1)[0]
                    dir_name = f.read(ln)[:-1].decode('cp1251', 'replace')
                else:
                    dir_name = ''
                chunk = f.read(16 * count)
                for j in range(count):
                    _h, size, off = struct.unpack_from('<QII', chunk, j * 16)
                    entries.append([dir_name, size, off])

            # Блок имён файлов — сплошные нуль-терминированные строки.
            if self.flags & FLAG_FILE_NAMES:
                blob = f.read(_tot_file_len)
                names = blob.split(b'\x00')
                for idx, entry in enumerate(entries):
                    if idx < len(names):
                        entry.append(names[idx].decode('cp1251', 'replace'))
                    else:
                        entry.append('file%05d' % idx)
            else:
                for idx, entry in enumerate(entries):
                    entry.append('file%05d' % idx)

        for dir_name, size, off, fname in entries:
            compressed = self.default_compressed
            if size & COMPRESSION_TOGGLE:
                compressed = not compressed
                size &= ~COMPRESSION_TOGGLE
            key = (dir_name + '\\' + fname if dir_name else fname)
            self.files[key.replace('\\', '/').lower()] = (off, size, compressed)

    # ------------------------------------------------------------------ #

    def __contains__(self, path):
        return path.replace('\\', '/').lower() in self.files

    def list(self, prefix=''):
        prefix = prefix.replace('\\', '/').lower()
        return sorted(k for k in self.files if k.startswith(prefix))

    def read(self, path):
        key = path.replace('\\', '/').lower()
        if key not in self.files:
            raise KeyError('%s: нет файла %s' % (self.name, path))
        offset, size, compressed = self.files[key]
        with open(self.path, 'rb') as f:
            f.seek(offset)
            blob = f.read(size)

        pos = 0
        if self.embed_names:
            ln = blob[0]
            pos = 1 + ln
        if not compressed:
            return blob[pos:]

        original = struct.unpack_from('<I', blob, pos)[0]
        pos += 4
        payload = blob[pos:]
        if self.version >= 105:
            data = lz4.decompress(payload)
        else:
            data = zlib.decompress(payload)
        if original and len(data) != original:
            data = data[:original]
        return data


def find_archives(data_dir):
    """Все .bsa в папке Data, отсортированные по имени."""
    if not os.path.isdir(data_dir):
        return []
    return sorted(os.path.join(data_dir, n) for n in os.listdir(data_dir)
                  if n.lower().endswith('.bsa'))


def locate(data_dir, wanted, hint=None):
    """Найти файл `wanted` (например strings/skyrim_russian.dlstrings) в архивах.

    hint — имя архива, который стоит проверить первым.
    Возвращает (bytes, имя архива) либо (None, None).
    """
    archives = find_archives(data_dir)
    order = []
    if hint:
        order += [a for a in archives if hint.lower() in os.path.basename(a).lower()]
    order += [a for a in archives if 'interface' in os.path.basename(a).lower()]
    order += [a for a in archives if a not in order]

    for path in order:
        try:
            bsa = BSA(path)
        except Exception:
            continue
        if wanted in bsa:
            return bsa.read(wanted), os.path.basename(path)
    return None, None
