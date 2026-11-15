// Счёт 260 дней: 20 знаков × 13 чисел.
// Опора — корреляция Альфонсо Касо: 13 августа 1521 года (юлианский календарь,
// падение Теночтитлана) = день «1 Коатль». В пролептическом григорианском — 23.08.1521.
// Даты считаются целыми днями григорианского календаря — без часовых поясов.
import { SIGNS } from './data/signs.js';
import { NIGHT_LORDS, DIRS } from './data/lords.js';

const ANCHOR_SIGN = 4;     // Коатль — пятый знак (с нуля)
const ANCHOR_POS = 104;    // его место в 260-дневном круге

export function mod(a, m) { const r = a % m; return r < 0 ? r + m : r; }

// номер дня от 01.01.1970 в пролептическом григорианском календаре
export function civilDays(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const ANCHOR = civilDays(1521, 8, 23);

// как DateTime.TryParseExact(text.Trim(), "yyyy-MM-dd"): {y, m, d} или null
export function parseDay(text) {
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || '').trim());
  if (!t) return null;
  const y = +t[1], m = +t[2], d = +t[3];
  if (y < 1 || m < 1 || m > 12 || d < 1) return null;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const len = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return d > len ? null : { y, m, d };
}

// Date (локальная полночь) → «ГГГГ-ММ-ДД»
export function formatDay(date) {
  const p = (n, w) => String(n).padStart(w, '0');
  return p(date.getFullYear(), 4) + '-' + p(date.getMonth() + 1, 2) + '-' + p(date.getDate(), 2);
}

// день счёта: число, знак, место в круге, тресена, владыка ночи, сторона света
export function dayOf({ y, m, d }) {
  const days = civilDays(y, m, d) - ANCHOR;
  const number = mod(days, 13) + 1;                 // 1…13
  const signIdx = mod(ANCHOR_SIGN + days, 20);      // знак дня
  const pos = mod(ANCHOR_POS + days, 260);          // место в круге 260
  const treStart = days - (number - 1);             // тресена — «неделя» из 13 дней
  return {
    number, signIdx, pos,
    sign: SIGNS[signIdx],
    treSign: SIGNS[mod(ANCHOR_SIGN + treStart, 20)],
    nightLord: NIGHT_LORDS[mod(pos, 9)],
    dir: DIRS[signIdx % 4],
  };
}
