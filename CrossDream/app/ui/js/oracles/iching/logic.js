// И Цзин: бросок монет, линии, номер гексаграммы по Кинг Вэнь и текст для консоли.
import { KING_WEN_ORDER } from './data/kingwen.js';
import { HEXAGRAMS_01_32 } from './data/hexagrams-01-32.js';
import { HEXAGRAMS_33_64 } from './data/hexagrams-33-64.js';

// все 64 описания по порядку: ALL_HEXAGRAMS[номер - 1]
export const ALL_HEXAGRAMS = [...HEXAGRAMS_01_32, ...HEXAGRAMS_33_64];

// Линия гексаграммы:
// isYang — тип линии после преобразования (устойчивая);
// isOld — текущий флаг изменяемости (false для устойчивых линий);
// wasOld — была ли линия изменяющейся изначально.
function line(isYang, isOld, wasOld) {
  return { isYang, isOld, wasOld };
}

// Генерация исходной гексаграммы.
// Для каждой линии проводится 3 броска (метод монет), сумма может быть 6, 7, 8 или 9.
// Массив lines: индекс 0 – нижняя линия, индекс 5 – верхняя.
export function generateHexagram() {
  const lines = new Array(6);
  for (let i = 0; i < 6; i++) {
    let sum = 0;
    for (let j = 0; j < 3; j++) {
      // С вероятностью 50% добавляем 3, иначе 2.
      sum += Math.floor(Math.random() * 2) === 1 ? 3 : 2;
    }

    // Сумма определяет тип линии:
    // 6 – Старая Инь, 7 – Молодая Ян, 8 – Молодая Инь, 9 – Старая Ян.
    switch (sum) {
      case 6: lines[i] = line(false, true, true); break;
      case 7: lines[i] = line(true, false, false); break;
      case 8: lines[i] = line(false, false, false); break;
      case 9: lines[i] = line(true, true, true); break;
    }
  }
  return lines;
}

// Вычисление номера гексаграммы по бинарному индексу.
// Массив lines хранит линии так, что lines[0] – нижняя, lines[5] – верхняя.
// Бит i берётся из lines[5 - i] — как в исходной программе.
export function getKingWenNumber(lines) {
  let index = 0;
  for (let i = 0; i < 6; i++) {
    if (lines[5 - i].isYang) index |= (1 << i);
  }
  return KING_WEN_ORDER[index];
}

// Преобразование исходной гексаграммы во вторую устойчивую гексаграмму.
// Если линия была изменяющейся (isOld), она инвертируется, а значение wasOld сохраняется.
export function makeStable(original) {
  return original.map(l => l.isOld
    ? line(!l.isYang, false, l.wasOld)     // после преобразования линия становится устойчивой
    : l);
}

// Символ и подпись линии: для второй гексаграммы wasOld хранит исходный статус.
export function lineSymbol(l) {
  return l.isYang ? (l.wasOld ? '⚊→⚋' : '⚊') : (l.wasOld ? '⚋→⚊' : '⚋');
}

export function lineDescription(l) {
  return l.isYang ? (l.wasOld ? 'Старая Ян' : 'Молодая Ян') : (l.wasOld ? 'Старая Инь' : 'Молодая Инь');
}

// Полный расклад: исходная и результирующая гексаграммы с описаниями.
export function castReading() {
  const originalLines = generateHexagram();
  const originalNumber = getKingWenNumber(originalLines);
  const originalHex = ALL_HEXAGRAMS[originalNumber - 1];

  const finalLines = makeStable(originalLines);
  const finalNumber = getKingWenNumber(finalLines);
  const finalHex = ALL_HEXAGRAMS[finalNumber - 1];

  return { originalLines, originalNumber, originalHex, finalLines, finalNumber, finalHex };
}

// Текстовое описание гексаграмм для поля CONSOLE OUTPUT.
export function resultText(r) {
  return [
    'ИСХОДНАЯ ГЕКСАГРАММА:',
    `King Wen = ${r.originalNumber}`,
    `${r.originalHex.title}`,
    '',
    `${r.originalHex.description}`,
    '--------------------------------',
    'РЕЗУЛЬТИРУЮЩАЯ ГЕКСАГРАММА:',
    `King Wen = ${r.finalNumber}`,
    `${r.finalHex.title}`,
    '',
    `${r.finalHex.description}`,
    '',
  ].join('\n');
}
