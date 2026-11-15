// Личная палитра: цвета нитей по типам и обводки сфер (сон, планета).
// Источник — аккаунт сайта (user.colors); без входа — память этого устройства.

export const TYPES = ['локация', 'персонаж', 'эмоция', 'символ', 'сюжет'];
export const DEF_COLORS = {
  'локация': '#7dd3fc', 'персонаж': '#f9a8d4', 'эмоция': '#fca5a5',
  'символ': '#fcd34d', 'сюжет': '#a5b4fc', dream: '#8b7cf8', planet: '#7dd3fc', book: '#c084fc',
};

export const colors = { ...DEF_COLORS };
const subs = new Set();
const KEY = 'crossdream.colors';

function parse(v) {
  if (!v) return null;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return null; } }
  return v && typeof v === 'object' ? v : null;
}

try { Object.assign(colors, parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* без памяти */ }

export function onPalette(cb) { subs.add(cb); }

export function applyColors(obj) {
  Object.assign(colors, DEF_COLORS, parse(obj) || {});
  try { localStorage.setItem(KEY, JSON.stringify(colors)); } catch (e) { /* без памяти */ }
  for (const cb of subs) { try { cb(colors); } catch (e) { console.error('palette', e); } }
}

// вошёл сновидец со своей палитрой — берём её
export function fromUser(user) {
  const c = parse(user && user.colors);
  if (c) applyColors(c);
}

export const linkColor = type => colors[type] || '#888';
export const sphereColors = () => ({ dream: colors.dream, planet: colors.planet, book: colors.book });
