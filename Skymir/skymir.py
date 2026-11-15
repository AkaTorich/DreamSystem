#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Skymir — извлечение, анализ и печать книг Skyrim.

Команды:
  scan                  что вообще найдено: игра, плагины, сейвы
  extract [плагины...]  вытащить книги в out/books.json и out/txt/
  list [--grep ...]     показать извлечённые книги
  save <файл.ess>       разобрать сейв: кто, где, какие книги затронуты
  cosave <файл.skse>    вытащить тексты, сочинённые модами в игре
  pdf [--grep ...]      сверстать PDF
  analyze               статистика по корпусу -> out/analysis.md

Зависимостей нет: только стандартная библиотека Python и Edge для печати.
"""

import argparse
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

from lib import analyze as analyze_mod   # noqa: E402
from lib import plugin as plugin_mod     # noqa: E402
from lib import render                   # noqa: E402
from lib import save as save_mod         # noqa: E402
from lib import voynich                  # noqa: E402

OUT = os.path.join(ROOT, 'out')
BOOKS_JSON = os.path.join(OUT, 'books.json')
CONFIG = os.path.join(ROOT, 'config.json')

DEFAULT_CONFIG = {
    'game_dir': r'C:\Program Files (x86)\Steam\steamapps\common\Skyrim Special Edition',
    'saves_dir': os.path.expandvars(
        r'%USERPROFILE%\Documents\My Games\Skyrim Special Edition\Saves'),
    'language': None,
    'extra_plugin_dirs': [],
}

VANILLA = ('skyrim.esm', 'update.esm', 'dawnguard.esm',
           'hearthfires.esm', 'dragonborn.esm')


def cfg():
    data = dict(DEFAULT_CONFIG)
    if os.path.isfile(CONFIG):
        with open(CONFIG, encoding='utf-8') as f:
            data.update(json.load(f))
    return data


def data_dir(conf):
    return os.path.join(conf['game_dir'], 'Data')


def all_plugins(conf):
    out = []
    dirs = [data_dir(conf)] + list(conf.get('extra_plugin_dirs') or [])
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.lower().endswith(('.esm', '.esp', '.esl')):
                out.append(os.path.join(d, name))
    return out


def resolve_plugins(conf, names):
    """Имена/маски/пути -> реальные файлы. Без аргументов — ваниль + DLC."""
    every = all_plugins(conf)
    if not names:
        return [p for p in every if os.path.basename(p).lower() in VANILLA]
    picked = []
    for token in names:
        low = token.lower()
        if low in ('all', 'все'):
            return every
        if low in ('cc', 'creation', 'creations'):
            picked += [p for p in every
                       if os.path.basename(p).lower().startswith('cc')]
            continue
        if os.path.isfile(token):
            picked.append(os.path.abspath(token))
            continue
        hits = [p for p in every if low in os.path.basename(p).lower()]
        if hits:
            picked += hits
        else:
            print('  ! не нашёл плагин: %s' % token)
    seen, uniq = set(), []
    for p in picked:
        if p.lower() not in seen:
            seen.add(p.lower())
            uniq.append(p)
    return uniq


def load_books():
    if not os.path.isfile(BOOKS_JSON):
        sys.exit('Сначала выполните: python skymir.py extract')
    with open(BOOKS_JSON, encoding='utf-8') as f:
        return json.load(f)['books']


def filtered(books, args):
    out = books
    if getattr(args, 'grep', None):
        rx = re.compile(args.grep, re.I | re.U)
        out = [b for b in out
               if rx.search(b.get('title') or '') or rx.search(b.get('text') or '')
               or rx.search(b.get('editor_id') or '')]
    if getattr(args, 'plugin', None):
        low = args.plugin.lower()
        out = [b for b in out if low in b.get('plugin', '').lower()]
    if getattr(args, 'key', None):
        keys = {k.lower() for k in args.key}
        out = [b for b in out if b.get('key', '').lower() in keys]
    if getattr(args, 'nonempty', False):
        out = [b for b in out if b.get('chars', 0) > 0]
    if getattr(args, 'limit', 0):
        out = out[:args.limit]
    return out


def safe_name(text, fallback='book'):
    text = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '', text or '').strip()
    text = re.sub(r'\s+', ' ', text)
    return (text or fallback)[:80]


# ---------------------------------------------------------------------- #

def cmd_scan(args):
    conf = cfg()
    print('Игра:   %s' % conf['game_dir'])
    print('        %s' % ('найдена' if os.path.isdir(data_dir(conf)) else 'НЕ НАЙДЕНА'))
    plugins = all_plugins(conf)
    print('Плагины: %d (.esm/.esp/.esl)' % len(plugins))
    core = [p for p in plugins if os.path.basename(p).lower() in VANILLA]
    print('  ваниль и DLC: %s' % ', '.join(os.path.basename(p) for p in core))
    cc = [p for p in plugins if os.path.basename(p).lower().startswith('cc')]
    print('  Creation Club: %d' % len(cc))
    other = [p for p in plugins if p not in core and p not in cc]
    if other:
        print('  прочее: %s' % ', '.join(os.path.basename(p) for p in other[:20]))

    saves = conf['saves_dir']
    print('Сейвы:  %s' % saves)
    if os.path.isdir(saves):
        ess = [n for n in os.listdir(saves) if n.lower().endswith('.ess')]
        skse = [n for n in os.listdir(saves) if n.lower().endswith('.skse')]
        print('  .ess: %d, .skse: %d' % (len(ess), len(skse)))
        for n in sorted(ess, key=lambda x: os.path.getmtime(os.path.join(saves, x)),
                        reverse=True)[:5]:
            print('    %s' % n)
    else:
        print('  папка не найдена')
    print('Печать: %s' % (render.find_browser() or 'браузер для PDF не найден'))


def cmd_extract(args):
    conf = cfg()
    paths = resolve_plugins(conf, args.plugins)
    if not paths:
        sys.exit('Нечего разбирать.')
    print('Разбираю %d плагин(ов)...' % len(paths))

    def progress(name, total):
        print('  %-42s всего книг: %d' % (name, total))

    books, report = plugin_mod.load_books(paths, data_dir(conf),
                                          conf.get('language'), progress)
    os.makedirs(OUT, exist_ok=True)
    payload = {'report': report, 'books': [b.to_dict() for b in books]}

    # Книги письмом Войнича читаются обратно в английский.
    if not args.raw:
        decoded = 0
        for b in payload['books']:
            if voynich.looks_voynich(b['text']):
                b['text'] = voynich.from_eva(b['text'])
                b['voynich'] = True
                decoded += 1
        if decoded:
            print('расшифровано письмом Войнича: %d книг' % decoded)
    with open(BOOKS_JSON, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print('\n%d книг -> %s' % (len(books), os.path.relpath(BOOKS_JSON, ROOT)))

    for line in report:
        if 'error' in line:
            print('  ! %s: %s' % (line['plugin'], line['error']))
        elif line['localized'] and not line['strings_from']:
            print('  ! %s: строковая таблица не найдена, текста не будет'
                  % line['plugin'])

    if args.txt:
        txt_dir = os.path.join(OUT, 'txt')
        os.makedirs(txt_dir, exist_ok=True)
        for b in payload['books']:
            body = render.plain_text(b)
            if not body:
                continue
            name = '%s_%s.txt' % (b['form_id'], safe_name(b['title'], b['editor_id']))
            with open(os.path.join(txt_dir, name), 'w', encoding='utf-8') as f:
                f.write('%s\n%s\n\n%s\n' % (b['title'], '=' * len(b['title']), body))
        print('txt -> %s' % os.path.relpath(txt_dir, ROOT))


def cmd_list(args):
    books = filtered(load_books(), args)
    for b in books:
        print('%-22s %5d зн.  %-45s %s'
              % (b['key'], b['chars'], (b['title'] or '')[:45], b['editor_id']))
    print('\nвсего: %d' % len(books))


def cmd_save(args):
    conf = cfg()
    path = args.file
    if not os.path.isfile(path):
        cand = os.path.join(conf['saves_dir'], path)
        if os.path.isfile(cand):
            path = cand
        elif os.path.isdir(conf['saves_dir']):
            hits = [n for n in os.listdir(conf['saves_dir'])
                    if n.lower().endswith('.ess') and path.lower() in n.lower()]
            if hits:
                path = os.path.join(conf['saves_dir'], hits[0])
    if not os.path.isfile(path):
        sys.exit('Сейв не найден: %s' % args.file)

    sv = save_mod.Save(path).load()
    info = sv.summary()
    print('Сейв:      %s' % info['file'])
    print('Персонаж:  %s, %s, уровень %s' % (info['player'], info['race'], info['level']))
    print('Место:     %s' % info['location'])
    print('Дата игры: %s   сохранён: %s' % (info['game_date'], info['saved_at']))
    print('Сжатие:    %s   формa: %s' % (info['compression'], info['form_version']))
    print('Плагинов:  %d (+%d лёгких)' % (info['plugins'], info['light_plugins']))
    print('ChangeForm: %d, FormID в массиве: %d'
          % (info['change_forms'], info['form_ids']))
    for e in info['errors']:
        print('  ! %s' % e)

    touched = sv.touched_form_ids()
    matched = []
    if os.path.isfile(BOOKS_JSON):
        books = load_books()
        # Лёгкие плагины (.esl) адресуются 12 битами, обычные — 24.
        index_full, index_light = {}, {}
        for b in books:
            local = int(b['form_id'], 16) & 0xFFFFFF
            plug = b['plugin'].lower()
            index_full.setdefault((plug, local), b)
            if plug.endswith('.esl'):
                index_light.setdefault((plug, local & 0xFFF), b)
        for fid in touched:
            name, local = sv.plugin_for(fid)
            if not name:
                continue
            table = index_light if (fid >> 24) == 0xFE else index_full
            b = table.get((name.lower(), local))
            if b:
                matched.append((fid, b))
        matched.sort(key=lambda x: -(x[1]['chars']))
        print('\nКниги, затронутые в этом сейве (прочитаны/перемещены): %d'
              % len(matched))
        for fid, b in matched[:args.limit or 40]:
            print('  %08X  %-45s %5d зн.' % (fid, (b['title'] or '')[:45], b['chars']))
    else:
        print('\n(books.json нет — сначала extract, тогда сверю книги)')

    os.makedirs(OUT, exist_ok=True)
    dump = os.path.join(OUT, 'save_%s.json' % safe_name(
        os.path.splitext(info['file'])[0])[:60])
    with open(dump, 'w', encoding='utf-8') as f:
        json.dump({'info': info, 'plugins': sv.plugins,
                   'light_plugins': sv.light_plugins,
                   'books_touched': [{'form_id': '%08X' % fid, **b}
                                     for fid, b in matched]},
                  f, ensure_ascii=False, indent=1)
    print('\nПодробности -> %s' % os.path.relpath(dump, ROOT))

    if matched and args.pdf:
        _make_pdf([b for _f, b in matched],
                  os.path.join(OUT, 'Книги из сейва.pdf'),
                  'Книги из сейва', info['player'] + ' · ' + info['game_date'])


def cmd_cosave(args):
    conf = cfg()
    path = args.file
    if not os.path.isfile(path):
        cand = os.path.join(conf['saves_dir'], path)
        path = cand if os.path.isfile(cand) else path
    if not os.path.isfile(path):
        sys.exit('Ко-сейв не найден: %s' % args.file)
    found = save_mod.cosave_strings(path, args.min_len)
    print('Строк найдено: %d' % len(found))
    os.makedirs(OUT, exist_ok=True)
    dump = os.path.join(OUT, 'cosave_%s.txt' % safe_name(
        os.path.splitext(os.path.basename(path))[0])[:60])
    with open(dump, 'w', encoding='utf-8') as f:
        f.write('\n'.join(found))
    for s in found[:args.limit or 30]:
        print('  %s' % (s[:150].replace('\n', ' ')))
    print('\n-> %s' % os.path.relpath(dump, ROOT))


def _make_pdf(books, pdf_path, title, subtitle):
    html_path = os.path.splitext(pdf_path)[0] + '.html'
    doc = render.build_html(books, title=title, subtitle=subtitle)
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(doc)
    print('HTML -> %s' % os.path.relpath(html_path, ROOT))
    render.html_to_pdf(html_path, pdf_path)
    size = os.path.getsize(pdf_path) / 1024
    print('PDF  -> %s (%.0f КБ)' % (os.path.relpath(pdf_path, ROOT), size))


def cmd_pdf(args):
    books = filtered(load_books(), args)
    books = [b for b in books if b.get('chars', 0) > 0]
    if not books:
        sys.exit('Под фильтр ничего не попало.')
    books.sort(key=lambda b: (b.get('title') or '').lower())
    print('В печать: %d книг' % len(books))
    os.makedirs(OUT, exist_ok=True)
    name = args.out or 'Книги Скайрима.pdf'
    if not name.lower().endswith('.pdf'):
        name += '.pdf'
    _make_pdf(books, os.path.join(OUT, name),
              args.title or 'Книги Скайрима',
              args.subtitle or ('отобрано: %d' % len(books)))


def cmd_analyze(args):
    books = filtered(load_books(), args)
    books = [b for b in books if b.get('chars', 0) > 0]
    if not books:
        sys.exit('Нечего анализировать.')
    report, per = analyze_mod.corpus_report(books)
    os.makedirs(OUT, exist_ok=True)
    md = os.path.join(OUT, 'analysis.md')
    with open(md, 'w', encoding='utf-8') as f:
        f.write(report)
    with open(os.path.join(OUT, 'analysis.json'), 'w', encoding='utf-8') as f:
        json.dump(per, f, ensure_ascii=False, indent=1)
    print(report[:1500])
    print('\nПолный отчёт -> %s' % os.path.relpath(md, ROOT))


# ---------------------------------------------------------------------- #

def main():
    ap = argparse.ArgumentParser(
        prog='skymir', description='Книги Skyrim: извлечение, анализ, печать')
    sub = ap.add_subparsers(dest='cmd', required=True)

    sub.add_parser('scan', help='что найдено на диске').set_defaults(func=cmd_scan)

    p = sub.add_parser('extract', help='вытащить книги из плагинов')
    p.add_argument('plugins', nargs='*',
                   help='имена/маски/пути; all — все, cc — Creation Club; '
                        'по умолчанию ваниль и DLC')
    p.add_argument('--txt', action='store_true', help='ещё и отдельные txt')
    p.add_argument('--raw', action='store_true',
                   help='не читать письмо Войнича обратно в английский')
    p.set_defaults(func=cmd_extract)

    p = sub.add_parser('list', help='показать извлечённые книги')
    p.add_argument('--grep'), p.add_argument('--plugin')
    p.add_argument('--limit', type=int, default=0)
    p.add_argument('--nonempty', action='store_true')
    p.set_defaults(func=cmd_list)

    p = sub.add_parser('save', help='разобрать сейв .ess')
    p.add_argument('file')
    p.add_argument('--pdf', action='store_true', help='сразу сверстать PDF')
    p.add_argument('--limit', type=int, default=0)
    p.set_defaults(func=cmd_save)

    p = sub.add_parser('cosave', help='строки из ко-сейва .skse')
    p.add_argument('file')
    p.add_argument('--min-len', type=int, default=12, dest='min_len')
    p.add_argument('--limit', type=int, default=0)
    p.set_defaults(func=cmd_cosave)

    p = sub.add_parser('pdf', help='сверстать PDF')
    p.add_argument('--grep'), p.add_argument('--plugin')
    p.add_argument('--key', nargs='*'), p.add_argument('--limit', type=int, default=0)
    p.add_argument('--out'), p.add_argument('--title'), p.add_argument('--subtitle')
    p.set_defaults(func=cmd_pdf)

    p = sub.add_parser('analyze', help='статистика по корпусу')
    p.add_argument('--grep'), p.add_argument('--plugin')
    p.add_argument('--limit', type=int, default=0)
    p.set_defaults(func=cmd_analyze)

    args = ap.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
