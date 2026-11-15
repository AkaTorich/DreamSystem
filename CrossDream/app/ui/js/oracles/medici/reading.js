// Тексты трактовки для лога: раскладка цепочки, найденная цепочка с блоками, жадный
// расчёт и текст для сохранения/копирования. describe(card) — смысл карты под текущий режим.
import { GREETING_LENGTH, cardName, same } from './cards.js';

const names = list => list.map(cardName).join(', ');
const text = lines => lines.join('\n') + '\n';

export function planNote(rules, target, hung, addedResult, describe) {
  const L = ['── Раскладка цепочки ──'];
  L.push(rules.greeting
    ? '1. Приветствие духа: звенья 1–3, только 6/7/8 — мелкие и быстрые.'
    : '1. Приветствие духа: правило снято.');
  if (!rules.hung)
    L.push('2. Проработка зависшего: правило снято.');
  else if (hung.length === 0)
    L.push('2. Проработка зависшего: список пуст, блок не ставится.');
  else
    L.push(`2. Проработка зависшего: ${hung.length} звен. сразу после приветствия (${names(hung)}).`);
  if (rules.result)
    L.push(addedResult == null
      ? '3. Результат: цель уже замыкается десяткой.'
      : `3. Результат: в хвост цели дописано звено ${cardName(addedResult)} — ${describe(addedResult)}`);
  else
    L.push('3. Результат: правило снято.');
  L.push(`Цель: ${names(target)}`);
  return text(L);
}

export function chainText(chain, rules, targetLength, hungCount, addedResult, describe) {
  const hungStart = rules.greeting ? GREETING_LENGTH : 0;
  const hungEnd = hungStart + (rules.hung ? hungCount : 0);
  const targetStart = chain.length - targetLength;

  const L = ['Найденная цепочка:'];
  for (let i = 0; i < chain.length; i++) {
    if (rules.greeting && i === 0)
      L.push('[ПРИВЕТСТВИЕ ДУХА]');
    if (rules.hung && hungCount > 0 && i === hungStart)
      L.push('[ПРОРАБОТКА ЗАВИСШЕГО]');
    if (i === hungEnd && i < targetStart && (rules.greeting || hungCount > 0))
      L.push('[ТЕЛО ЦЕПОЧКИ]');
    if (i === targetStart)
      L.push('[ЦЕЛЬ]');
    if (addedResult != null && same(chain[i], addedResult))
      L.push('[РЕЗУЛЬТАТ]');

    L.push(`${i + 1}. ${cardName(chain[i])}: ${describe(chain[i])}`);
  }

  if (rules.result)
    L.push('Замыкание: отметь радость от свершившегося — иначе цепочка не закрыта.');
  return text(L);
}

export function greedyNote(finalStack) {
  return '── Жадный расчёт ──\n'
    + 'Правила свёрток не применяются: цепочка растёт от цели назад, наугад.\n'
    + `Цель: ${names(finalStack)}`;
}

export function plainChainText(chain, describe) {
  const L = ['Найденная цепочка:'];
  for (let i = 0; i < chain.length; i++)
    L.push(`${i + 1}. ${cardName(chain[i])}: ${describe(chain[i])}`);
  return text(L);
}

// трактовка-цепочка из лога для файла или буфера обмена
export function exportText(purposeTitle, greedy, log) {
  return text([
    'ПАСЬЯНС МЕДИЧИ — трактовка цепочки',
    'Предназначение: ' + purposeTitle,
    'Алгоритм: ' + (greedy ? 'жадный (старый)' : 'перебор с возвратами'),
    '─'.repeat(40),
    '',
  ]) + (log || '');
}
