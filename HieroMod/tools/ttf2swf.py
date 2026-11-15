# -*- coding: utf-8 -*-
"""TTF -> SWF: сборка игровых шрифтов Skyrim (Scaleform).

Игра читает шрифты из SWF-библиотек, перечисленных в fontconfig.txt.
Внутри — теги DefineFont2: контуры глифов в квадратичных кривых, em = 20480
единиц, ось Y направлена вниз. TrueType хранит ровно такие же квадратичные
кривые, только Y вверх, поэтому пересчёт сводится к масштабу и знаку.

Формат повторяет рабочий hiero_font.swf: FWS 8, FileAttributes,
DefineFont2 + DefineFontName на каждый шрифт, ShowFrame, End.

    python ttf2swf.py вывод.swf шрифт1.ttf шрифт2.ttf
"""

import os
import struct
import sys

EM = 20480            # единиц на кегельную площадку, как у шрифтов Bethesda
SWF_VERSION = 8
FRAME_RECT = bytes.fromhex('800002800000028000')
FRAME_RATE = bytes.fromhex('000c0100')


# ---------------------------------------------------------------------- #
#  Чтение TrueType
# ---------------------------------------------------------------------- #

class TrueType:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.d = f.read()
        if self.d[:4] not in (b'\x00\x01\x00\x00', b'true', b'ttcf'):
            raise ValueError('%s: не TrueType с контурами glyf'
                             % os.path.basename(path))
        self.path = path
        self.tables = {}
        num = struct.unpack_from('>H', self.d, 4)[0]
        for i in range(num):
            tag, _cs, off, ln = struct.unpack_from('>4sIII', self.d, 12 + 16 * i)
            self.tables[tag.decode('latin1')] = (off, ln)
        if 'glyf' not in self.tables:
            raise ValueError('%s: контуры не TrueType (CFF/OpenType не поддержан)'
                             % os.path.basename(path))
        head = self.tables['head'][0]
        self.upm = struct.unpack_from('>H', self.d, head + 18)[0]
        self.loca_long = struct.unpack_from('>h', self.d, head + 50)[0] == 1
        self.num_glyphs = struct.unpack_from('>H', self.d, self.tables['maxp'][0] + 4)[0]
        hhea = self.tables['hhea'][0]
        self.ascender = struct.unpack_from('>h', self.d, hhea + 4)[0]
        self.descender = struct.unpack_from('>h', self.d, hhea + 6)[0]
        self.line_gap = struct.unpack_from('>h', self.d, hhea + 8)[0]
        self.num_hmetrics = struct.unpack_from('>H', self.d, hhea + 34)[0]
        self._loca()
        self.family = self._name(1) or os.path.splitext(os.path.basename(path))[0]

    def _loca(self):
        off, _ln = self.tables['loca']
        n = self.num_glyphs + 1
        if self.loca_long:
            self.loca = struct.unpack_from('>%dI' % n, self.d, off)
        else:
            self.loca = [v * 2 for v in struct.unpack_from('>%dH' % n, self.d, off)]

    def _name(self, nid):
        off, _ln = self.tables['name']
        count, storage = struct.unpack_from('>HH', self.d, off + 2)
        best = None
        for i in range(count):
            pid, _eid, _lid, this, ln, o = struct.unpack_from('>6H', self.d, off + 6 + 12 * i)
            if this != nid:
                continue
            raw = self.d[off + storage + o:off + storage + o + ln]
            try:
                value = raw.decode('utf-16-be') if pid == 3 else raw.decode('latin1')
            except UnicodeDecodeError:
                continue
            if pid == 3:
                return value
            best = best or value
        return best

    # ------------------------------------------------------------------ #

    def cmap(self):
        """Юникод -> индекс глифа, из подтаблицы формата 4."""
        off, _ln = self.tables['cmap']
        n = struct.unpack_from('>H', self.d, off + 2)[0]
        sub = None
        for i in range(n):
            pid, eid, o = struct.unpack_from('>HHI', self.d, off + 4 + 8 * i)
            fmt = struct.unpack_from('>H', self.d, off + o)[0]
            if fmt == 4 and (pid, eid) in ((3, 1), (0, 3), (0, 4), (3, 10)):
                sub = off + o
                if (pid, eid) == (3, 1):
                    break
        if sub is None:
            raise ValueError('%s: нет cmap формата 4' % os.path.basename(self.path))

        seg2 = struct.unpack_from('>H', self.d, sub + 6)[0]
        seg = seg2 // 2
        ends = struct.unpack_from('>%dH' % seg, self.d, sub + 14)
        starts = struct.unpack_from('>%dH' % seg, self.d, sub + 16 + seg2)
        deltas = struct.unpack_from('>%dh' % seg, self.d, sub + 16 + seg2 * 2)
        rpos = sub + 16 + seg2 * 3
        ranges = struct.unpack_from('>%dH' % seg, self.d, rpos)

        out = {}
        for i in range(seg):
            for code in range(starts[i], min(ends[i], 0xFFFE) + 1):
                if ranges[i] == 0:
                    gid = (code + deltas[i]) & 0xFFFF
                else:
                    gp = rpos + i * 2 + ranges[i] + (code - starts[i]) * 2
                    if gp + 2 > len(self.d):
                        continue
                    gid = struct.unpack_from('>H', self.d, gp)[0]
                    if gid:
                        gid = (gid + deltas[i]) & 0xFFFF
                if gid and gid < self.num_glyphs:
                    out[code] = gid
        return out

    def advance(self, gid):
        off, _ln = self.tables['hmtx']
        i = min(gid, self.num_hmetrics - 1)
        return struct.unpack_from('>H', self.d, off + 4 * i)[0]

    # ------------------------------------------------------------------ #

    def contours(self, gid, depth=0):
        """Контуры глифа: список списков точек (x, y, на_кривой), Y вверх."""
        start, end = self.loca[gid], self.loca[gid + 1]
        if end <= start or depth > 5:
            return []
        base = self.tables['glyf'][0] + start
        n_contours = struct.unpack_from('>h', self.d, base)[0]
        if n_contours < 0:
            return self._composite(base + 10, depth)

        p = base + 10
        ends = struct.unpack_from('>%dH' % n_contours, self.d, p)
        p += 2 * n_contours
        instr = struct.unpack_from('>H', self.d, p)[0]
        p += 2 + instr
        n_points = (ends[-1] + 1) if n_contours else 0

        flags = []
        while len(flags) < n_points:
            f = self.d[p]
            p += 1
            flags.append(f)
            if f & 0x08:
                rep = self.d[p]
                p += 1
                flags += [f] * rep
        flags = flags[:n_points]

        xs, value = [], 0
        for f in flags:
            if f & 0x02:
                dx = self.d[p]
                p += 1
                value += dx if f & 0x10 else -dx
            elif not f & 0x10:
                value += struct.unpack_from('>h', self.d, p)[0]
                p += 2
            xs.append(value)

        ys, value = [], 0
        for f in flags:
            if f & 0x04:
                dy = self.d[p]
                p += 1
                value += dy if f & 0x20 else -dy
            elif not f & 0x20:
                value += struct.unpack_from('>h', self.d, p)[0]
                p += 2
            ys.append(value)

        out, first = [], 0
        for last in ends:
            pts = [(xs[i], ys[i], bool(flags[i] & 0x01))
                   for i in range(first, min(last + 1, n_points))]
            if len(pts) > 1:
                out.append(pts)
            first = last + 1
        return out

    def _composite(self, p, depth):
        out = []
        while True:
            flags, gid = struct.unpack_from('>HH', self.d, p)
            p += 4
            if flags & 0x0001:
                a1, a2 = struct.unpack_from('>hh', self.d, p)
                p += 4
            else:
                a1, a2 = struct.unpack_from('>bb', self.d, p)
                p += 2
            xx = yy = 1.0
            xy = yx = 0.0
            if flags & 0x0008:
                xx = yy = _f2dot14(self.d, p)
                p += 2
            elif flags & 0x0040:
                xx = _f2dot14(self.d, p)
                yy = _f2dot14(self.d, p + 2)
                p += 4
            elif flags & 0x0080:
                xx = _f2dot14(self.d, p)
                yx = _f2dot14(self.d, p + 2)
                xy = _f2dot14(self.d, p + 4)
                yy = _f2dot14(self.d, p + 6)
                p += 8
            dx, dy = (a1, a2) if flags & 0x0002 else (0, 0)
            for contour in self.contours(gid, depth + 1):
                out.append([(round(x * xx + y * xy + dx),
                             round(x * yx + y * yy + dy), on)
                            for x, y, on in contour])
            if not flags & 0x0020:
                break
        return out


def _f2dot14(d, p):
    return struct.unpack_from('>h', d, p)[0] / 16384.0


# ---------------------------------------------------------------------- #
#  Контуры TrueType -> отрезки и квадратичные кривые
# ---------------------------------------------------------------------- #

def path_of(contour, scale):
    """(старт, [сегменты]) в координатах SWF: Y вниз, единицы em=20480."""
    pts = [(round(x * scale), round(-y * scale), on) for x, y, on in contour]

    # Начинать нужно с точки на кривой; если такой нет — берём середину.
    start_i = next((i for i, p in enumerate(pts) if p[2]), None)
    if start_i is None:
        mx = (pts[0][0] + pts[-1][0]) // 2
        my = (pts[0][1] + pts[-1][1]) // 2
        pts = [(mx, my, True)] + pts
        start_i = 0
    pts = pts[start_i:] + pts[:start_i]

    start = (pts[0][0], pts[0][1])
    segs = []
    cur = start
    i = 1
    n = len(pts)
    while i <= n:
        x, y, on = pts[i % n]
        if on:
            if (x, y) != cur:
                segs.append(('l', x, y))
                cur = (x, y)
            i += 1
            continue
        # управляющая точка; якорь — следующая точка либо середина между
        # двумя управляющими подряд
        nx, ny, non = pts[(i + 1) % n]
        if not non:
            nx, ny = (x + nx) // 2, (y + ny) // 2
            step = 1
        else:
            step = 2
        segs.append(('q', x, y, nx, ny))
        cur = (nx, ny)
        i += step
    return start, segs


# ---------------------------------------------------------------------- #
#  Битовая запись SWF
# ---------------------------------------------------------------------- #

class Bits:
    def __init__(self):
        self.out = bytearray()
        self.cur = 0
        self.nbits = 0

    def ub(self, value, n):
        for shift in range(n - 1, -1, -1):
            self.cur = (self.cur << 1) | ((value >> shift) & 1)
            self.nbits += 1
            if self.nbits == 8:
                self.out.append(self.cur)
                self.cur = 0
                self.nbits = 0

    def sb(self, value, n):
        self.ub(value & ((1 << n) - 1), n)

    def align(self):
        if self.nbits:
            self.out.append(self.cur << (8 - self.nbits))
            self.cur = 0
            self.nbits = 0
        return bytes(self.out)


def sbits(value):
    n = 1
    while not (-(1 << (n - 1)) <= value <= (1 << (n - 1)) - 1):
        n += 1
    return n


def ubits(value):
    return max(1, value.bit_length())


def rect(xmin, xmax, ymin, ymax):
    n = max(sbits(xmin), sbits(xmax), sbits(ymin), sbits(ymax))
    b = Bits()
    b.ub(n, 5)
    for v in (xmin, xmax, ymin, ymax):
        b.sb(v, n)
    return b.align()


def glyph_shape(paths):
    """SHAPE без стилей: заливка 1 на первом контуре, дальше только MoveTo."""
    b = Bits()
    b.ub(1, 4)   # NumFillBits
    b.ub(0, 4)   # NumLineBits
    first = True
    cur = (0, 0)
    for start, segs in paths:
        mb = max(sbits(start[0]), sbits(start[1]))
        b.ub(0, 1)                      # StyleChangeRecord
        b.ub(0, 1)                      # новых стилей нет
        b.ub(0, 1)                      # линия не меняется
        b.ub(1 if first else 0, 1)      # заливка 1
        b.ub(0, 1)                      # заливка 0
        b.ub(1, 1)                      # MoveTo
        b.ub(mb, 5)
        b.sb(start[0], mb)
        b.sb(start[1], mb)
        if first:
            b.ub(1, 1)                  # индекс заливки = 1 (NumFillBits = 1)
            first = False
        cur = start
        for seg in segs:
            if seg[0] == 'l':
                dx, dy = seg[1] - cur[0], seg[2] - cur[1]
                n = max(2, sbits(dx), sbits(dy))
                b.ub(1, 1)              # ребро
                b.ub(1, 1)              # прямое
                b.ub(n - 2, 4)
                b.ub(1, 1)              # общий случай, обе дельты
                b.sb(dx, n)
                b.sb(dy, n)
                cur = (seg[1], seg[2])
            else:
                cdx, cdy = seg[1] - cur[0], seg[2] - cur[1]
                adx, ady = seg[3] - seg[1], seg[4] - seg[2]
                n = max(2, sbits(cdx), sbits(cdy), sbits(adx), sbits(ady))
                b.ub(1, 1)
                b.ub(0, 1)              # кривая
                b.ub(n - 2, 4)
                b.sb(cdx, n)
                b.sb(cdy, n)
                b.sb(adx, n)
                b.sb(ady, n)
                cur = (seg[3], seg[4])
    b.ub(0, 6)                          # конец фигуры
    return b.align()


def tag(code, data):
    if len(data) < 0x3F:
        return struct.pack('<H', (code << 6) | len(data)) + data
    return struct.pack('<HI', (code << 6) | 0x3F, len(data)) + data


# ---------------------------------------------------------------------- #
#  Сборка DefineFont2
# ---------------------------------------------------------------------- #

def define_font2(font_id, ttf, name=None, codes=None):
    scale = EM / ttf.upm
    table = ttf.cmap()
    # Управляющие коды игре не нужны и путают таблицу кодов.
    wanted = sorted(c for c in table
                    if c >= 0x20 and (codes is None or c in codes))
    if not wanted:
        raise ValueError('%s: нечего экспортировать' % ttf.family)

    shapes, advances, bounds = [], [], []
    for code in wanted:
        gid = table[code]
        paths = [path_of(c, scale) for c in ttf.contours(gid)]
        paths = [p for p in paths if p[1]]
        shapes.append(glyph_shape(paths))
        advances.append(_clamp(round(ttf.advance(gid) * scale)))
        xs, ys = [], []
        for start, segs in paths:
            xs.append(start[0])
            ys.append(start[1])
            for seg in segs:
                xs += seg[1::2][:2]
                ys += seg[2::2][:2]
        if xs:
            bounds.append((min(xs), max(xs), min(ys), max(ys)))
        else:
            bounds.append((0, 0, 0, 0))

    n = len(wanted)
    name = (name or ttf.family).encode('cp1252', 'replace') + b'\x00'

    head = struct.pack('<HBBB', font_id, 0x8C, 0, len(name)) + name
    head += struct.pack('<H', n)

    # Смещения широкие (32 бита) — считаются от начала таблицы смещений.
    table_size = 4 * (n + 1)
    offsets, pos = [], table_size
    for shape in shapes:
        offsets.append(pos)
        pos += len(shape)
    code_offset = pos

    body = struct.pack('<%dI' % (n + 1), *(offsets + [code_offset]))
    body += b''.join(shapes)
    body += struct.pack('<%dH' % n, *wanted)

    layout = struct.pack('<3h',
                         _clamp(round(ttf.ascender * scale)),
                         _clamp(round(-ttf.descender * scale)),
                         _clamp(round(ttf.line_gap * scale)))
    layout += struct.pack('<%dh' % n, *advances)
    layout += b''.join(rect(*bb) for bb in bounds)
    layout += struct.pack('<H', 0)      # кернинг не переносим

    return head + body + layout, n, wanted


def _clamp(v):
    return max(-32768, min(32767, int(v)))


def define_font_name(font_id, name, copyright_=''):
    return (struct.pack('<H', font_id)
            + name.encode('cp1252', 'replace') + b'\x00'
            + copyright_.encode('cp1252', 'replace') + b'\x00')


def build(out_path, fonts, verbose=True):
    """fonts: список путей к ttf либо пар (путь, имя_в_игре)."""
    tags = [tag(69, b'\x00\x00\x00\x00')]      # FileAttributes
    report = []
    for i, item in enumerate(fonts, 1):
        path, name = item if isinstance(item, (tuple, list)) else (item, None)
        ttf = TrueType(path)
        name = name or ttf.family
        data, count, codes = define_font2(i, ttf, name)
        tags.append(tag(75, data))
        tags.append(tag(88, define_font_name(i, name)))
        report.append((name, count, codes[0], codes[-1], os.path.basename(path)))
        if verbose:
            print('  %-14s глифов %-5d U+%04X..U+%04X  <- %s'
                  % (name, count, codes[0], codes[-1], os.path.basename(path)))
    tags.append(tag(1, b''))                   # ShowFrame
    tags.append(tag(0, b''))                   # End

    body = FRAME_RECT + FRAME_RATE + b''.join(tags)
    total = 8 + len(body)
    blob = b'FWS' + bytes([SWF_VERSION]) + struct.pack('<I', total) + body
    with open(out_path, 'wb') as f:
        f.write(blob)
    if verbose:
        print('  -> %s (%.0f КБ)' % (out_path, len(blob) / 1024))
    return report


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    build(sys.argv[1], sys.argv[2:])
    return 0


if __name__ == '__main__':
    sys.exit(main())
