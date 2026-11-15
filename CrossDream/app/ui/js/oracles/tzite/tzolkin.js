// Цолькин: 260 дней (20 имён × 13 чисел), счёт по корреляции GMT (584283):
// 0.0.0.0.0 = 4 Ахав 8 Кумк'у. Даты — целыми днями григорианского календаря, без часовых поясов.

export function mod(a, m) { const r = a % m; return r < 0 ? r + m : r; }

// номер дня от 01.01.1970 в пролептическом григорианском календаре
function civilDays(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const MJD_EPOCH = civilDays(1858, 11, 17);

// юлианский номер дня, как в старой программе: (d − 17.11.1858) + 2400001
export function jdn({ y, m, d }) { return civilDays(y, m, d) - MJD_EPOCH + 2400001; }

// число 1…13 и имя дня 0…19 (0 = Imix)
export function tzolkin(j) {
  return { num: mod(j + 5, 13) + 1, idx: mod(j + 16, 20) };
}

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
