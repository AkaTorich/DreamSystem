"""Анализ корпуса книг: объёмы, лексика, состав символов."""

import re
import unicodedata
from collections import Counter

from .render import plain_text

WORD_RE = re.compile(r"[^\W\d_]+(?:['’-][^\W\d_]+)*", re.UNICODE)

STOP = set("""
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по
только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли
если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя
ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без
будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой
совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех
никогда можно при наконец два об другой хоть после над больше тот через эти нас
про всего них какая много разве три эту моя впрочем хорошо свою этой перед
иногда лучше чуть том нельзя такой им более всегда конечно всю между
the of and to a in is that it for as with was on by at be this from or an are
""".split())


def stats_for(book):
    text = plain_text(book)
    words = [w.lower() for w in WORD_RE.findall(text)]
    chars = Counter(text)
    return {
        'key': book.get('key'),
        'title': book.get('title') or book.get('editor_id'),
        'plugin': book.get('plugin'),
        'chars': len(text),
        'words': len(words),
        'unique': len(set(words)),
        'ttr': round(len(set(words)) / len(words), 3) if words else 0.0,
        'sentences': len(re.findall(r'[.!?…]+', text)),
        'pages': text.count('* * *') + 1,
        'scripts': script_mix(chars),
        'top': [w for w, _ in Counter(
            w for w in words if w not in STOP and len(w) > 3).most_common(12)],
    }


def script_mix(chars):
    """Состав по системам письма — ловит иероглифы и подменённые глифы."""
    buckets = Counter()
    for ch, n in chars.items():
        cp = ord(ch)
        if ch.isspace():
            continue
        if 0x13000 <= cp <= 0x1342F:
            buckets['египетские иероглифы'] += n
        elif 0xE000 <= cp <= 0xF8FF:
            buckets['частная область (PUA)'] += n
        elif not ch.isalnum():
            buckets['пунктуация'] += n
        else:
            try:
                name = unicodedata.name(ch).split()[0].lower()
            except ValueError:
                name = 'неизвестно'
            buckets[{'cyrillic': 'кириллица', 'latin': 'латиница',
                     'digit': 'цифры'}.get(name, name)] += n
    total = sum(buckets.values()) or 1
    return {k: round(v * 100 / total, 1) for k, v in buckets.most_common(6)}


def corpus_report(books, limit_top=30):
    per = [stats_for(b) for b in books]
    words = Counter()
    for b in books:
        for w in WORD_RE.findall(plain_text(b)):
            w = w.lower()
            if w not in STOP and len(w) > 3:
                words[w] += 1
    total_chars = sum(p['chars'] for p in per)
    total_words = sum(p['words'] for p in per)
    per_sorted = sorted(per, key=lambda p: -p['chars'])

    lines = ['# Анализ корпуса книг', '']
    lines.append('- Книг: **%d**' % len(per))
    lines.append('- Символов: **%s**' % f'{total_chars:,}'.replace(',', ' '))
    lines.append('- Слов: **%s**' % f'{total_words:,}'.replace(',', ' '))
    if per:
        lines.append('- Средний объём: **%d** слов' % (total_words / len(per)))
        lines.append('- Пустых (без текста): **%d**'
                     % sum(1 for p in per if p['chars'] == 0))
    lines.append('')

    lines.append('## Самые длинные')
    lines.append('')
    lines.append('| # | Книга | Слов | Стр. | TTR | Плагин |')
    lines.append('|---|---|---|---|---|---|')
    for i, p in enumerate(per_sorted[:20], 1):
        lines.append('| %d | %s | %d | %d | %.3f | %s |'
                     % (i, p['title'], p['words'], p['pages'], p['ttr'], p['plugin']))
    lines.append('')

    lines.append('## Частотный словарь корпуса')
    lines.append('')
    lines.append(', '.join('%s (%d)' % (w, n) for w, n in words.most_common(limit_top)))
    lines.append('')

    mixed = [p for p in per if any(k in ('египетские иероглифы', 'частная область (PUA)')
                                   for k in p['scripts'])]
    if mixed:
        lines.append('## Нестандартные системы письма')
        lines.append('')
        for p in mixed:
            lines.append('- **%s** (%s): %s' % (
                p['title'], p['key'],
                ', '.join('%s %s%%' % (k, v) for k, v in p['scripts'].items())))
        lines.append('')

    return '\n'.join(lines), per
