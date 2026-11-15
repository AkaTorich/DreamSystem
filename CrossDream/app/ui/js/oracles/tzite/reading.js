// Тексты Цитэ: подписи дней, строка горсти и ответ хранителя дней.
import { DAYS } from './data/days.js';
import { REMAINDER, TONE, WEIGHT, NUM_WORDS } from './data/answers.js';

export const BAD_DAY = 'День не разобран. Впиши его как ГГГГ-ММ-ДД — например 2026-08-11.';
export const BAD_DAY_SHORT = 'день не разобран: впиши ГГГГ-ММ-ДД';
export const NOT_THROWN = 'ГОРСТЬ НЕ БРОШЕНА';
export const START_TEXT = 'Хранитель дней берёт горсть красных семян цитэ и раскладывает их по четыре. ' +
  'Число кучек уводит счёт вперёд по цолькину, остаток говорит, каков ответ. ' +
  'Впиши день сна и вопрос — и бросай.';

// день сна: имя и науаль
export function dayTexts({ num, idx }) {
  return { name: num + ' ' + DAYS[idx].maya, ru: DAYS[idx].ru + '\nнауаль сна: ' + DAYS[idx].says };
}

// день-ответ: имя и что он говорит
export function answerTexts({ num, idx }) {
  return { name: num + ' ' + DAYS[idx].maya, ru: DAYS[idx].ru + '\n' + DAYS[idx].says };
}

export function handLine(c) {
  return 'ГОРСТЬ: ' + c.hand + ' семян  ·  кучек по четыре: ' + c.piles + '  ·  в остатке: ' + c.rest;
}

function numWord(n) { return NUM_WORDS[n] || NUM_WORDS[13]; }

function verdict(num, idx, rest) {
  const voice = 'день ' + DAYS[idx].maya + ' говорит о том, что ' + DAYS[idx].says;
  const tone = TONE[rest];
  const weight = num <= 4 ? WEIGHT.small : num <= 9 ? WEIGHT.firm : WEIGHT.great;
  return voice + '. ' + tone + ' ' + weight;
}

// полный ответ; ask — вопрос (может быть пустым)
export function readingText(c, ask) {
  const s = c.start, a = c.answer;
  const sd = DAYS[s.idx], ad = DAYS[a.idx];
  let t = '';
  t += 'Сон приснился в день ' + s.num + ' ' + sd.maya +
    ' — ' + sd.ru + '. Это его науаль: ' + sd.says + '.\n\n';

  t += 'СЕМЕНА. В ладонь легло ' + c.hand +
    ' зёрен цитэ. Разложенные по четыре, они дали ' + c.piles +
    ' кучек и ' + c.rest + ' в остатке. ' + REMAINDER[c.rest] + '\n\n';

  t += 'СЧЁТ. От дня сна счёт ушёл вперёд на ' + c.piles +
    ' дней и замер на дне ' + a.num + ' ' + ad.maya +
    ' — ' + ad.ru + '. Этот день и отвечает.\n\n';

  if (ask.length > 0) t += 'НА ВОПРОС «' + ask + '»: ' + verdict(a.num, a.idx, c.rest) + '\n\n';
  else t += 'ОТВЕТ ДНЯ: ' + verdict(a.num, a.idx, c.rest) + '\n\n';

  t += 'СИЛА ЧИСЛА ' + a.num + ': ' + numWord(a.num) + '\n';
  t += 'Хранитель дней не оставляет ответ словами: зажги свечу по цвету стороны, ' +
    'поблагодари день, что говорил, и отдай долг предкам — иначе счёт вернётся тем же вопросом.';
  return t;
}
