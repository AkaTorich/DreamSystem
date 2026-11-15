"""Вёрстка книг в HTML и печать в PDF.

PDF печатается встроенным в Windows браузером Edge в headless-режиме —
это избавляет от сторонних библиотек и корректно тянет шрифты, включая
иероглифические диапазоны.
"""

import html
import os
import re
import shutil
import subprocess
import tempfile

# Chrome первым: Edge 151 в headless-режиме молча не печатает.
BROWSERS = (
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
)

TAG_RE = re.compile(r'<([a-zA-Z/][^>]*)>')
FONT_RE = re.compile(r"face\s*=\s*['\"]?\$?([A-Za-z_]+)", re.I)
ALIGN_RE = re.compile(r"align\s*=\s*['\"]?(left|center|right)", re.I)

CSS = """
:root{
  --ink:#241c12; --ink-soft:#5b4b39; --paper:#f6efe0; --edge:#d9c9a8;
}
*{box-sizing:border-box}
body{margin:0;background:#e8e0cf;color:var(--ink);
     font-family:'Palatino Linotype','Book Antiqua','Cambria',Georgia,serif;}
.page{
  background:var(--paper); width:170mm; min-height:247mm; margin:0 auto 8mm;
  padding:22mm 22mm 18mm; position:relative;
  box-shadow:0 1px 6px rgba(0,0,0,.18);
}
.page.break{page-break-after:always;}
.book-head{border-bottom:1.5px solid var(--edge);margin-bottom:9mm;padding-bottom:5mm}
.book-title{font-size:19pt;letter-spacing:.4px;margin:0 0 2mm;font-weight:600}
.book-meta{font-size:8.5pt;color:var(--ink-soft);letter-spacing:.3px;
           font-family:Consolas,'Courier New',monospace}
.body{font-size:12pt;line-height:1.62;text-align:justify;hyphens:auto}
.body p{margin:0 0 3.4mm;text-indent:6mm}
.body p:first-of-type{text-indent:0}
.body p.drop::first-letter{font-size:215%;line-height:.86;float:left;
  padding:0 2mm 0 0;color:var(--ink-soft);font-weight:600}
.body p.center{text-align:center;text-indent:0;margin:5mm 0}
.body p.right{text-align:right;text-indent:0}
.body .hand{font-family:'Segoe Script','Gabriola',cursive;font-size:13pt}
.body .hiero{font-family:'Segoe UI Historic','Noto Sans Egyptian Hieroglyphs',
             'Segoe UI Symbol',serif;font-size:17pt;line-height:1.5}
.folio{position:absolute;bottom:9mm;left:0;right:0;text-align:center;
       font-size:8.5pt;color:var(--ink-soft);font-variant:small-caps}
.toc{font-size:11pt;line-height:1.75}
.toc a{color:var(--ink);text-decoration:none}
.toc .n{color:var(--ink-soft);font-family:Consolas,monospace;font-size:9pt}
h1.cover{font-size:26pt;text-align:center;margin:60mm 0 4mm}
p.cover-sub{text-align:center;color:var(--ink-soft);font-size:11pt;text-indent:0}
@page{size:A4;margin:0}
@media print{body{background:#fff}.page{box-shadow:none;margin:0}}
"""

HIERO = re.compile(r'[\U00013000-\U0001342F\uE000-\uF8FF]')


def markup_to_html(text):
    """Разметка Bethesda -> безопасный HTML, поделённый на страницы."""
    if not text:
        return ['<p><em>(пусто)</em></p>']

    pages = [_page_html(p) for p in re.split(r'\[pagebreak\]', text, flags=re.I)]
    pages = [p for p in pages if p.strip()] or ['<p><em>(пусто)</em></p>']

    # Буквица — только на первом абзаце связного текста, не на титуле.
    first = pages[0]
    if first.startswith('<p>') and len(re.sub(r'<[^>]*>', '', first)) > 250:
        pages[0] = '<p class="drop">' + first[3:]
    return pages


def _page_html(src):
    src = src.replace('\r\n', '\n')
    tokens = []
    pos = 0
    for m in TAG_RE.finditer(src):
        tokens.append(('text', src[pos:m.start()]))
        tokens.append(('tag', m.group(1)))
        pos = m.end()
    tokens.append(('text', src[pos:]))

    parts = []
    align = ''
    font_class = ''
    open_p = False
    para_empty = True

    def close():
        nonlocal open_p
        if open_p:
            while parts and parts[-1] == '<br>':
                parts.pop()
            parts.append('</p>')
            open_p = False

    def opener():
        nonlocal open_p, para_empty
        if not open_p:
            cls = ' '.join(c for c in (align, font_class) if c)
            parts.append('<p class="%s">' % cls if cls else '<p>')
            open_p = True
            para_empty = True

    for kind, value in tokens:
        if kind == 'text':
            if not value.strip() and not open_p:
                continue
            opener()
            # Перевод строки в книгах Bethesda — настоящий разрыв строки,
            # пустая строка — вертикальный интервал. Больше одной подряд не нужно.
            value = re.sub(r'\n{3,}', '\n\n', value)
            lines = html.escape(value).split('\n')
            if para_empty:
                while lines and not lines[0].strip():
                    lines.pop(0)
            for i, line in enumerate(lines):
                if i:
                    parts.append('<br>')
                if line.strip():
                    parts.append(_wrap_hiero(line))
                    para_empty = False
        else:
            low = value.lower().strip()
            if low.startswith('p'):
                close()
                m = ALIGN_RE.search(value)
                align = {'center': 'center', 'right': 'right'}.get(
                    m.group(1).lower(), '') if m else ''
            elif low.startswith('/p'):
                close()
            elif low.startswith('br'):
                opener()
                parts.append('<br>')
            elif low.startswith('font'):
                m = FONT_RE.search(value)
                face = (m.group(1).lower() if m else '')
                font_class = 'hand' if 'hand' in face else ''
                close()
            elif low.startswith('/font'):
                font_class = ''
                close()
            elif low.startswith('img'):
                opener()
                parts.append('<span class="hiero">◆</span>')
            elif low.startswith(('b', 'i', '/b', '/i')):
                opener()
                parts.append('<%s>' % low.split()[0])
    close()
    return ''.join(parts)


def _wrap_hiero(chunk):
    """Иероглифы и знаки из PUA получают свой шрифт и кегль."""
    return re.sub(r'((?:[\U00013000-\U0001342F\uE000-\uF8FF]\s*)+)',
                  lambda m: '<span class="hiero">%s</span>' % m.group(1), chunk)


def build_html(books, title='Библиотека Скайрима', with_toc=True, subtitle=''):
    doc = ['<meta charset="utf-8"><title>%s</title><style>%s</style>'
           % (html.escape(title), CSS)]

    doc.append('<section class="page break"><h1 class="cover">%s</h1>'
               '<p class="cover-sub">%s</p></section>'
               % (html.escape(title), html.escape(subtitle)))

    if with_toc and len(books) > 1:
        rows = []
        for i, b in enumerate(books, 1):
            rows.append('<div><a href="#b%d">%s</a> '
                        '<span class="n">— %s · %d зн.</span></div>'
                        % (i, html.escape(b.get('title') or b.get('editor_id') or '?'),
                           html.escape(b.get('key', '')), b.get('chars', 0)))
        doc.append('<section class="page break"><div class="book-head">'
                   '<h2 class="book-title">Содержание</h2></div>'
                   '<div class="toc">%s</div></section>' % ''.join(rows))

    for i, b in enumerate(books, 1):
        pages = markup_to_html(b.get('text', ''))
        meta = '%s · %s · %d зн.' % (b.get('key', ''),
                                     b.get('editor_id', ''), b.get('chars', 0))
        for j, page in enumerate(pages):
            head = ''
            anchor = ''
            if j == 0:
                anchor = ' id="b%d"' % i
                head = ('<div class="book-head"><h2 class="book-title">%s</h2>'
                        '<div class="book-meta">%s</div></div>'
                        % (html.escape(b.get('title') or b.get('editor_id') or '?'),
                           html.escape(meta)))
            doc.append('<section class="page break"%s>%s<div class="body">%s</div>'
                       '<div class="folio">%s · %d/%d</div></section>'
                       % (anchor, head, page,
                          html.escape(b.get('title') or ''), j + 1, len(pages)))
    return '\n'.join(doc)


def find_browser():
    for p in BROWSERS:
        if os.path.isfile(p):
            return p
    return None


def html_to_pdf(html_path, pdf_path, timeout=300):
    browser = find_browser()
    if not browser:
        raise RuntimeError('не найден Chrome или Edge для печати в PDF')
    profile = tempfile.mkdtemp(prefix='skymir_')
    url = 'file:///' + os.path.abspath(html_path).replace('\\', '/')
    cmd = [
        browser, '--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + profile,
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=20000',
        '--no-pdf-header-footer',
        '--print-to-pdf=' + os.path.abspath(pdf_path),
        url,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=timeout)
        if not os.path.isfile(pdf_path) or os.path.getsize(pdf_path) < 1000:
            msg = (proc.stderr or b'').decode('utf-8', 'replace')[-500:]
            raise RuntimeError(
                'печать не удалась через %s. %s\n'
                'Подсказка: Edge 151 в headless молчит — поставьте Chrome '
                'или откройте HTML и напечатайте в PDF вручную (Ctrl+P).'
                % (os.path.basename(browser), msg))
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    return pdf_path


def plain_text(book):
    """Текст книги без разметки — для txt-выгрузки и анализа."""
    text = re.sub(r'\[pagebreak\]', '\n\n* * *\n\n', book.get('text', ''), flags=re.I)
    text = re.sub(r'<[^>]*>', '', text)
    text = html.unescape(text)
    text = re.sub(r'[ \t]+', ' ', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()
