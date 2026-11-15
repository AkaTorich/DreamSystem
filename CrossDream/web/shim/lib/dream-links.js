// Нити снов: по общей локации (core\src\ops.rs) и донесение разницы до сайта
// (add_links пачками по сотне, как sync\links.rs; снятые нити — del_link).
import * as http from './http.js';
import { C, linkKey, siteIdOf } from './dreams-cache.js';
import { sameLoc, dreamLocation } from './util.js';

export const LOC = 'локация';

// новые нити «локация» от сна idx к снам той же локации (без уже имеющихся)
function locationLinks(dreams, idx) {
  const d = dreams[idx];
  const loc = dreamLocation(d);
  if (!loc) return [];
  return dreams
    .filter(o => o.Id !== d.Id && sameLoc(dreamLocation(o), loc))
    .filter(o => !d.Links.some(l => l.Id === o.Id && l.Type === LOC) && !(o.Links || []).some(l => l.Id === d.Id && l.Type === LOC))
    .map(o => ({ Id: o.Id, Type: LOC, Reason: 'та же локация — ' + loc }));
}

// сцепить сон с одноместными снами
export function linkByLocation(dreams, id) {
  const i = dreams.findIndex(d => d.Id === id);
  if (i < 0) return;
  dreams[i].Links = dreams[i].Links || [];
  dreams[i].Links.push(...locationLinks(dreams, i));
}

// локация сна сменилась: старые нити «локация» (свои и входящие) снимаются, вяжутся новые
export function relinkLocation(dreams, id) {
  for (const d of dreams) {
    d.Links = (d.Links || []).filter(l => (d.Id === id ? l.Type !== LOC : !(l.Id === id && l.Type === LOC)));
  }
  linkByLocation(dreams, id);
}

// множество нитей списка: «свой a|свой b|тип» → {a, b, type, reason}
function linkSet(dreams) {
  const m = new Map();
  for (const d of dreams) {
    for (const l of d.Links || []) {
      if (!l || !l.Id || l.Id === d.Id) continue;
      const k = linkKey(d.Id, l.Id, l.Type || '');
      if (!m.has(k)) m.set(k, { a: d.Id, b: l.Id, type: l.Type || '', reason: l.Reason || '' });
    }
  }
  return m;
}

// донести до сайта разницу нитей «было» → «стало». allowDelete — снятые нити убрать и там.
// Ответ — число принятых сайтом новых нитей.
export async function commitLinks(before, after, allowDelete) {
  const was = linkSet(before), now = linkSet(after);
  const items = [];
  for (const [k, l] of now) {
    if (was.has(k)) continue;
    const a = siteIdOf(l.a), b = siteIdOf(l.b);
    if (a == null || b == null || a === b) continue;   // сна ещё нет на сайте
    items.push({ a, b, type: l.type, reason: l.reason });
  }
  let added = 0;
  for (let i = 0; i < items.length; i += 100) {
    const r = await http.postJson('add_links', { items: items.slice(i, i + 100) });
    added += +(r && r.added) || 0;
  }
  if (allowDelete) {
    for (const [k, l] of was) {
      if (now.has(k)) continue;
      const a = siteIdOf(l.a), b = siteIdOf(l.b);
      if (a == null || b == null) continue;
      const id = C.linkId.get(linkKey(a, b, l.type));
      if (id != null) await http.postJson('del_link', { id });
    }
  }
  return added;
}
