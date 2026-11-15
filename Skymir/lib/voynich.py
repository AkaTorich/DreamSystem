"""Обратное чтение книг, написанных письмом рукописи Войнича.

Шрифты EVA — прямая транслитерация, поэтому текст в плагине уже английский.
Отличие одно: буквы w в рукописи нет, она записана двумя v. Настоящая пара
v при записи разделена неразрывным пробелом, поэтому чтение однозначно.

Парная реализация живёт в моде: HieroMod\\voynich.py
"""

ESCAPE = ' '


def from_eva(text):
    """Текст из игры -> английский."""
    out = (text.replace('v' + ESCAPE + 'v', '\x00')
               .replace('V' + ESCAPE + 'V', '\x01'))
    out = out.replace('vv', 'w').replace('VV', 'W')
    return out.replace('\x00', 'vv').replace('\x01', 'VV')


def looks_voynich(text):
    """Грубый признак: текст размечен шрифтом EVA."""
    return '$EVAFont' in text or '$EVAHandFont' in text
