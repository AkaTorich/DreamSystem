# -*- coding: utf-8 -*-
"""Проверка собранного SWF: глифы читаются обратно и рисуются рядом с TTF.

Слева — контуры, разобранные из готового SWF (то, что увидит игра),
справа — тот же текст, отрисованный браузером прямо из TTF. Совпало —
значит конвертация верна.

    python swf_font_preview.py шрифт.swf проверка.html "текст" [ttf ...]
"""

import base64
import html
import os
import struct
import sys

EM = 20480


class BitReader:
    def __init__(self, data):
        self.d = data
        self.p = 0
        self.bit = 0

    def ub(self, n):
        v = 0
        for _ in range(n):
            v = (v << 1) | ((self.d[self.p] >> (7 - self.bit)) & 1)
            self.bit += 1
            if self.bit == 8:
                self.bit = 0
                self.p += 1
        return v

    def sb(self, n):
        v = self.ub(n)
        if n and v & (1 << (n - 1)):
            v -= 1 << n
        return v


def read_tags(path):
    with open(path, 'rb') as f:
        d = f.read()
    body = d[8:]
    p = ((5 + (body[0] >> 3) * 4) + 7) // 8 + 4
    out = []
    while p + 2 <= len(body):
        th = struct.unpack_from('<H', body, p)[0]
        p += 2
        code, ln = th >> 6, th & 0x3F
        if ln == 0x3F:
            ln = struct.unpack_from('<I', body, p)[0]
            p += 4
        out.append((code, body[p:p + ln]))
        p += ln
    return out


def parse_font(seg):
    q = 0
    font_id = struct.unpack_from('<H', seg, q)[0]
    q += 2
    flags = seg[q]
    q += 2                              # флаги + язык
    nl = seg[q]
    q += 1
    name = seg[q:q + nl].rstrip(b'\x00').decode('cp1252', 'replace')
    q += nl
    n = struct.unpack_from('<H', seg, q)[0]
    q += 2
    wide_off = bool(flags & 0x08)
    wide_codes = bool(flags & 0x04)
    base = q
    fmt = 'I' if wide_off else 'H'
    step = 4 if wide_off else 2
    offsets = struct.unpack_from('<%d%s' % (n + 1, fmt), seg, base)
    code_off = offsets[n]
    codes = struct.unpack_from('<%d%s' % (n, 'H' if wide_codes else 'B'),
                               seg, base + code_off)
    glyphs = {}
    for i in range(n):
        end = offsets[i + 1] if i + 1 < n else code_off
        glyphs[codes[i]] = shape_paths(seg[base + offsets[i]:base + end])
    lay = base + code_off + (2 if wide_codes else 1) * n
    ascent, descent, _leading = struct.unpack_from('<3h', seg, lay)
    advances = struct.unpack_from('<%dh' % n, seg, lay + 6)
    return {'id': font_id, 'name': name, 'codes': list(codes),
            'glyphs': glyphs, 'ascent': ascent, 'descent': descent,
            'advance': dict(zip(codes, advances))}


def shape_paths(data):
    """SHAPE -> список подпутей [(x0,y0), ('l',x,y) | ('q',cx,cy,x,y), ...]."""
    if not data:
        return []
    r = BitReader(data)
    fill_bits = r.ub(4)
    line_bits = r.ub(4)
    paths, cur_path = [], None
    x = y = 0
    while True:
        if r.p >= len(data):
            break
        if r.ub(1) == 0:                              # StyleChangeRecord
            new_styles = r.ub(1)
            line_style = r.ub(1)
            fill1 = r.ub(1)
            fill0 = r.ub(1)
            move = r.ub(1)
            if not (new_styles or line_style or fill1 or fill0 or move):
                break                                  # конец фигуры
            if move:
                mb = r.ub(5)
                x = r.sb(mb)
                y = r.sb(mb)
                if cur_path:
                    paths.append(cur_path)
                cur_path = [(x, y)]
            if fill0:
                r.ub(fill_bits)
            if fill1:
                r.ub(fill_bits)
            if line_style:
                r.ub(line_bits)
            if new_styles:
                break
        else:
            straight = r.ub(1)
            n = r.ub(4) + 2
            if straight:
                if r.ub(1):
                    x += r.sb(n)
                    y += r.sb(n)
                elif r.ub(1):
                    y += r.sb(n)
                else:
                    x += r.sb(n)
                if cur_path is not None:
                    cur_path.append(('l', x, y))
            else:
                cx = x + r.sb(n)
                cy = y + r.sb(n)
                x = cx + r.sb(n)
                y = cy + r.sb(n)
                if cur_path is not None:
                    cur_path.append(('q', cx, cy, x, y))
    if cur_path:
        paths.append(cur_path)
    return paths


def svg_for(font, text, size=64):
    """Строка текста контурами из SWF."""
    scale = size / EM
    pen = 0
    d = []
    for ch in text:
        paths = font['glyphs'].get(ord(ch))
        if paths:
            for path in paths:
                x0, y0 = path[0]
                d.append('M%.1f %.1f' % ((pen + x0) * scale, y0 * scale))
                for seg in path[1:]:
                    if seg[0] == 'l':
                        d.append('L%.1f %.1f' % ((pen + seg[1]) * scale, seg[2] * scale))
                    else:
                        d.append('Q%.1f %.1f %.1f %.1f'
                                 % ((pen + seg[1]) * scale, seg[2] * scale,
                                    (pen + seg[3]) * scale, seg[4] * scale))
                d.append('Z')
        pen += font['advance'].get(ord(ch), EM // 2)
    width = max(1, pen * scale)
    top = -font['ascent'] * scale
    height = (font['ascent'] + font['descent']) * scale
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%.0f" height="%.0f" '
            'viewBox="%.1f %.1f %.1f %.1f"><path d="%s" fill="currentColor" '
            'fill-rule="nonzero"/></svg>'
            % (width, height, 0, top, width, height, ' '.join(d)))


def build_preview(swf, out_html, text, ttfs):
    fonts = [parse_font(seg) for code, seg in read_tags(swf) if code == 75]
    faces, rows = [], []
    for i, font in enumerate(fonts):
        ttf = ttfs[i] if i < len(ttfs) else None
        face = ''
        if ttf and os.path.isfile(ttf):
            with open(ttf, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('ascii')
            faces.append("@font-face{font-family:'ref%d';src:url(data:font/ttf;base64,%s);}"
                         % (i, b64))
            face = 'ref%d' % i
        rows.append(
            '<section><h2>%s <small>%d глифов, ascent %d</small></h2>'
            '<div class="row"><b>из SWF</b><div class="art">%s</div></div>'
            '<div class="row"><b>из TTF</b><div class="ref" style="font-family:%s">%s</div></div>'
            '</section>'
            % (html.escape(font['name']), len(font['codes']), font['ascent'],
               svg_for(font, text), face or 'serif', html.escape(text)))

    doc = ("""<meta charset="utf-8"><title>Проверка шрифтов</title><style>
body{background:#14110d;color:#efe6d4;font-family:Segoe UI,sans-serif;padding:24px 28px}
h2{font-size:15px;font-weight:600;margin:26px 0 10px;color:#e8c98a}
small{color:#8a7c65;font-weight:400}
section{border-top:1px solid #33291c;padding-top:6px}
.row{display:flex;align-items:center;gap:16px;margin:10px 0}
.row b{width:70px;font-size:11px;color:#8a7c65;font-weight:600;text-transform:uppercase}
.art{color:#efe6d4}
.ref{font-size:64px;line-height:1.1}
</style>""" + ''.join('<style>%s</style>' % f for f in faces) + ''.join(rows))
    with open(out_html, 'w', encoding='utf-8') as f:
        f.write(doc)
    return out_html


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 1
    build_preview(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:])
    print('->', sys.argv[2])
    return 0


if __name__ == '__main__':
    sys.exit(main())
