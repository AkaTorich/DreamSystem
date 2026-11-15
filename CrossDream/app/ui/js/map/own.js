// Своя карта: сны-звёзды, планеты-локации, нити по типам. Правки положения — в ядро.
import * as api from '../shell/api.js';
import { state, thumbSrc, online, patchSettings } from '../dreams/store.js';
import { locKey, dreamLoc, utcStamp, errText } from '../dreams/util.js';

// узлы и нити из снов. Планета — там, где ей есть кого собирать: два и более снов
// либо книга-фундамент; локация одинокого сна уходит подписью под ним.
export function buildOwn() {
  const nodes = [], edges = [], byId = {};
  for (const d of state.dreams) {
    const n = {
      id: d.Id, label: d.Title || 'Сон без имени', cluster: 0,
      pos: d.PosX != null && d.PosY != null && d.PosZ != null ? [+d.PosX, +d.PosY, +d.PosZ] : null,
      image: d.ImageFile ? thumbSrc(d) : null,   // кружку — миниатюра, не полная картинка
    };
    nodes.push(n); byId[d.Id] = n;
  }
  const seen = new Set();
  for (const d of state.dreams)
    for (const l of d.Links) {
      if (l.Type === 'локация' || !byId[l.Id] || l.Id === d.Id) continue;   // локацию несёт планета
      const key = (d.Id < l.Id ? d.Id + '|' + l.Id : l.Id + '|' + d.Id) + l.Type;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: 'l' + seen.size, a: d.Id, b: l.Id, type: l.Type, reason: l.Reason });
    }
  const groups = new Map();
  for (const d of state.dreams) {
    const name = dreamLoc(d);
    if (!name) continue;
    const k = locKey(name);
    if (!groups.has(k)) groups.set(k, { name, items: [] });
    groups.get(k).items.push(d);
  }
  for (const [k, g] of groups) {
    const founded = state.founded.has(k);
    if (g.items.length < 2 && !founded) {
      for (const d of g.items) byId[d.Id].sub = g.name;
      continue;
    }
    const pp = state.planets[k];
    nodes.push({
      id: 'P:' + k, label: g.name, planet: true, founded, cluster: 0,
      pos: pp && pp.X != null ? [+pp.X, +pp.Y, +pp.Z] : null,
    });
    for (const d of g.items) edges.push({ id: 'pe' + d.Id, a: 'P:' + k, b: d.Id, type: 'локация' });
  }
  return { nodes, edges };
}

// обработчики своей карты: открыть, переставить, выровнять орбиты, запомнить вид
export function ownHandlers(ctx, rebuild) {
  let viewT = null;
  return {
    onSelect(id) {
      if (String(id).startsWith('P:')) return;   // планета — не сон
      ctx.bus.emit('dream:open', id);
    },
    async onMove(m) {
      const id = String(m.id);
      try {
        if (id.startsWith('P:')) {
          const key = id.slice(2);
          const pos = { X: m.x, Y: m.y, Z: m.z, Time: utcStamp() };
          state.planets[key] = pos;
          await api.invoke('planet_set', { key, pos });
          return;
        }
        const d = state.dreams.find(x => x.Id === id);
        if (d) { d.PosX = m.x; d.PosY = m.y; d.PosZ = m.z; d.PosTime = utcStamp(); }
        await api.invoke('positions_save', { items: [{ id, x: m.x, y: m.y, z: m.z }] });
      } catch (e) { ctx.ui.toast('Место не сохранилось: ' + errText(e)); }
    },
    async onAlign(pid) {   // двойной клик по планете — спутники возвращаются на ровную орбиту
      const key = String(pid).slice(2);
      const sats = state.dreams.filter(d => locKey(dreamLoc(d)) === key);
      if (!sats.length) return;
      try {
        await api.invoke('positions_save', { items: sats.map(d => ({ id: d.Id })) });
        for (const d of sats) { d.PosX = d.PosY = d.PosZ = null; }
        rebuild();
        ctx.ui.toast('Орбиты «' + (sats.length ? dreamLoc(sats[0]) : key) + '» выровнены');
      } catch (e) { ctx.ui.toast('Орбиты: ' + errText(e)); }
    },
    onView(v) {            // личный вид — в настройки и (если вошли) в аккаунт, с задержкой
      clearTimeout(viewT);
      viewT = setTimeout(async () => {
        const patch = { MapZoom: v.zoom, MapPanX: v.panx, MapPanY: v.pany };
        if (online()) {
          try { const r = await api.site('save_view', v); if (r && r.time) patch.ViewTime = r.time; }
          catch (e) { /* вид сохранится локально */ }
        }
        patchSettings(patch);
      }, 800);
    },
  };
}
