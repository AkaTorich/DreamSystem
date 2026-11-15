// Сообщения окна (как MessageBox исходника): текст, заголовок, вид — info | warning | error.

export const MSG = {
  alreadyInFinal: { text: 'Эта карта уже добавлена в конечную стопку!', caption: 'Предупреждение', kind: 'warning' },
  hungBlocksFinal: { text: 'Эта карта отмечена как зависшее — уберите её оттуда.', caption: 'Предупреждение', kind: 'warning' },
  finalFull: { text: 'Нельзя добавить более 36 карт в конечную стопку!', caption: 'Ошибка', kind: 'error' },
  alreadyHung: { text: 'Эта карта уже отмечена как зависшее!', caption: 'Предупреждение', kind: 'warning' },
  finalBlocksHung: { text: 'Эта карта стоит в цели — уберите её оттуда.', caption: 'Предупреждение', kind: 'warning' },

  noTarget: { text: 'Не выбраны карты для финальной стопки!', caption: 'Ошибка', kind: 'error' },
  noPerson: {
    text: 'Предназначение «на встречу с человеком»: добавьте в цель карту-персону — Валета, Даму или Короля.',
    caption: 'Нет персоны в цели', kind: 'warning',
  },
  targetBroken: (a, b) => ({
    text: `Звенья цели ${a} и ${b} не сцепляются: нужна общая масть или общее достоинство.`,
    caption: 'Цель не свёрнута', kind: 'error',
  }),
  noResult: {
    text: 'Не нашлось свободной десятки, сцепляющейся с хвостом цели. Снимите правило 3 или измените цель.',
    caption: 'Результат не дописать', kind: 'error',
  },
  noRoom: (target, hung, greeting) => ({
    text: `Не хватает места в колоде: цель (${target}) + зависшее (${hung}) + приветствие (${greeting}) больше 36 звеньев.`,
    caption: 'Ошибка', kind: 'error',
  }),

  found: { text: 'Цепочка найдена!', caption: 'Успех', kind: 'info' },
  chain: text => ({ text, caption: 'Цепочка', kind: 'info' }),

  emptyLogSave: { text: 'Лог пуст — сначала найдите цепочку.', caption: 'Нечего сохранять', kind: 'info' },
  emptyLogCopy: { text: 'Лог пуст — сначала найдите цепочку.', caption: 'Нечего копировать', kind: 'info' },
  saveFailed: reason => ({ text: 'Не удалось сохранить: ' + reason, caption: 'Ошибка', kind: 'error' }),
  copyFailed: reason => ({ text: 'Не удалось скопировать: ' + reason, caption: 'Ошибка', kind: 'error' }),

  // строки в лог
  logSaved: path => 'Трактовка сохранена: ' + path,
  logCopied: 'Трактовка скопирована в буфер обмена.',
  clipboardDenied: 'буфер обмена недоступен.',
};
