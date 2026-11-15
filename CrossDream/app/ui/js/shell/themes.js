// Расцветки окна: двадцать встроенных (themes-data.js), выбор — в «Настройках», запоминается
// на этом устройстве. Переключение ставит CSS-переменные на <html> и data-tone="dark|light";
// небо и кружки карты берут цвета через skin().
import { THEMES } from './themes-data.js';

export { THEMES };

const KEY = 'cd-theme';
let bus = null, cache = null;

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (hex, a) => 'rgba(' + rgb(hex).join(',') + ',' + a + ')';

// все переменные расцветки из её основных цветов
function vars(t) {
  return {
    '--bg': t.bg, '--panel': t.s2, '--border': t.line, '--border-bright': t.line2,
    '--text': t.text, '--dim': t.dim, '--faint': t.faint, '--accent': t.accent, '--glow': rgba(t.accent, .3),
    '--danger': t.danger, '--surface': t.surface, '--surface-2': t.s2, '--surface-3': t.s3,
    '--line': t.line, '--line-2': t.line2, '--accent-2': t.accent2,
    '--accent-ink': t.tone === 'light' ? t.text : t.label, '--header': t.header, '--input': t.input,
    '--primary': t.primary, '--primary-hi': t.primaryHi, '--primary-line': t.primaryLine,
    '--on-primary': t.tone === 'light' ? '#ffffff' : '#ffffff',
    '--gold': t.gold, '--gold-icon': t.goldIcon, '--tab-on': t.s3, '--picked': rgba(t.accent, .16), '--logo': t.accent,
    '--sky-1': t.sky[0], '--sky-2': t.sky[1], '--sky-3': t.sky[2], '--star': t.star,
    '--node-1': t.node[0], '--node-2': t.node[1], '--label': t.label, '--label-sub': t.sub,
    '--node-glow': rgba(t.accent, .5),
  };
}

export function currentTheme() {
  return document.documentElement.dataset.theme || 'night';
}

export function applyTheme(id, save = true) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars(t))) root.style.setProperty(k, v);
  root.style.colorScheme = t.tone;
  root.dataset.theme = t.id;
  root.dataset.tone = t.tone;
  cache = null;
  if (save) { try { localStorage.setItem(KEY, t.id); } catch { /* не запомнится — не беда */ } }
  if (bus) bus.emit('theme:changed', t.id);
}

// при запуске — до того, как области что-то нарисуют
export function initTheme(b) {
  bus = b;
  let id = 'night';
  try { id = localStorage.getItem(KEY) || 'night'; } catch { /* нет хранилища */ }
  applyTheme(id, false);
}

// цвета для холстов (небо, кружки карты)
export function skin() {
  if (cache) return cache;
  const t = THEMES.find(x => x.id === currentTheme()) || THEMES[0];
  cache = {
    sky: t.sky, aur: t.aur.map(h => rgb(h).join(',')), star: t.star,
    node1: t.node[0], node2: t.node[1], label: t.label, sub: t.sub,
    glow: rgba(t.accent, .55), light: t.tone === 'light',
  };
  return cache;
}
