// Вид карты (зум, сдвиг) и личная палитра — как core\src\sync\view.rs и colors.rs:
// вид — «новее — главнее» по view_time; палитра — правка без связи уезжает на сайт, иначе главнее сайт.
import * as http from './http.js';
import { loadSettings, editSettings } from './store.js';
import { decide, jx } from './util.js';

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// палитра из user.colors: сайт хранит её JSON-строкой; пусто — null
export function colorsFromUser(user) {
  const c = user ? user.colors : null;
  if (typeof c === 'string' && c.trim()) { try { return JSON.parse(c); } catch { return null; } }
  if (c && typeof c === 'object') return c;
  return null;
}

// отправить свой вид на сайт (save_view) и запомнить серверный штамп
export async function pushView() {
  const s = loadSettings();
  const zoom = s.MapZoom > 0 ? s.MapZoom : 1;
  const r = await http.postJson('save_view', { zoom, panx: s.MapPanX, pany: s.MapPanY });
  const t = jx.str(r, 'time');
  editSettings(x => { x.ViewTime = t; });
}

export async function applyView(user) {
  if (!user) return;
  const s = loadSettings();
  const mv = jx.str(user, 'map_view');
  const siteT = jx.s(user, 'view_time');
  const localHas = s.MapZoom > 0 || Math.abs(s.MapPanX) > 0.001 || Math.abs(s.MapPanY) > 0.001;
  const w = decide(localHas, s.ViewTime || null, mv !== '', siteT);
  if (w === 'site') {
    let v = null;
    try { v = JSON.parse(mv); } catch { v = null; }
    editSettings(x => {
      x.MapZoom = jx.f(v, 'zoom') ?? 1;
      x.MapPanX = jx.f(v, 'panx') ?? 0;
      x.MapPanY = jx.f(v, 'pany') ?? 0;
      x.ViewTime = siteT || '';
    });
  } else if (w === 'local') {
    await pushView();
  }
}

// отправить свою палитру (save_settings.colors); удалось — снять пометку правки без связи
export async function pushColors() {
  const s = loadSettings();
  const colors = s.Colors && typeof s.Colors === 'object' ? s.Colors : null;
  await http.postJson('save_settings', { colors });
  editSettings(x => { x.ColorsDirty = false; });
}

export async function applyColors(user) {
  if (!user) return;
  const s = loadSettings();
  const remote = colorsFromUser(user);
  const localHas = !!s.Colors && typeof s.Colors === 'object';
  if (s.ColorsDirty || (remote == null && localHas)) return pushColors();
  if (remote != null && !sameJson(remote, s.Colors)) editSettings(x => { x.Colors = remote; });
}

// сверить вид и палитру с пользователем из ответа login/me (ошибки — молча, как у ядра)
export async function applyUser(user) {
  try { await applyView(user); } catch (e) { console.warn('вид карты', e); }
  try { await applyColors(user); } catch (e) { console.warn('палитра', e); }
}
