// Места на карте: планеты-локации и авторские координаты снов (app\src\commands\places.rs).
// Штамп времени ставит сайт (save_planet_positions / save_positions отвечают `time`).
import * as http from '../lib/http.js';
import { requireLogin, isAuthError } from '../lib/session.js';
import * as cache from '../lib/dreams-cache.js';
import { clone } from '../lib/util.js';

const RECENT = 3000;   // planets_get идёт вместе с dreams_list — тот же ответ сайта

async function planets_get() {
  try { await cache.load(RECENT); } catch (e) { if (isAuthError(e)) return {}; throw e; }
  return clone(cache.C.planets);
}

// ключ планеты так, как его хранит сайт
const planetKey = s => String(s ?? '').trim().toLowerCase();

async function planet_set({ key, pos }) {
  requireLogin();
  const k = planetKey(key);
  if (!k) return null;
  const p = pos || {};
  const x = +p.X || 0, y = +p.Y || 0, z = +p.Z || 0;
  const r = await http.postJson('save_planet_positions', { items: [{ loc: k, x, y, z }] });
  cache.C.planets[k] = { X: x, Y: y, Z: z, Time: (r && r.time) || '' };
  return null;
}

// координаты снов; элемент без x/y/z — сброс на орбиту. Снов, которых нет на сайте, — пропуск
async function positions_save({ items }) {
  requireLogin();
  await cache.load(RECENT).catch(() => cache.C);
  const out = [], sent = [];
  for (const it of items || []) {
    const sid = cache.siteIdOf(it.id);
    if (sid == null) continue;
    const has = it.x != null && it.y != null && it.z != null;
    out.push(has ? { id: sid, x: +it.x, y: +it.y, z: +it.z } : { id: sid, x: null, y: null, z: null });
    sent.push([it.id, has ? [+it.x, +it.y, +it.z] : null]);
  }
  if (!out.length) return null;
  const r = await http.postJson('save_positions', { items: out });
  const time = (r && r.time) || null;
  for (const [id, p] of sent) {   // память ответа — в лад с сайтом, не дожидаясь перечитывания
    const d = cache.find(id);
    if (!d) continue;
    [d.PosX, d.PosY, d.PosZ] = p || [null, null, null];
    d.PosTime = time;
  }
  return null;
}

export const commands = { planets_get, planet_set, positions_save };
