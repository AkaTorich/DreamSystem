// «✦ Космос сновидцев» (модер и выше): звёзды-сновидцы с кольцами ранга, пунктир — мосты
// между картами. Клик по сновидцу — его карта: планеты, спутники, правки по иерархии.
import * as api from '../shell/api.js';
import { $, el } from '../shell/ui.js';
import { showForeign, showOwn } from '../map/view.js';
import { locKey, errText, narrow } from '../dreams/util.js';
import { currentUser } from '../account/site.js';
import { RANK } from './users.js';
import { openForeignCard, closeForeignCard, linking, finishLink } from './cosmos-card.js';

const MARK = { owner: '☾', admin: '☾', moder: '☾', user: '☾' };   // знак у имени; ранг видно по кольцам
let mode = null, users = [], cur = null, ctxRef = null;

export const cosmosMode = () => mode;

function siteImg(file) {
  return api.invoke('site_download', { rel: 'api.php?action=img&s=1&f=' + encodeURIComponent(file) })
    .then(p => api.fileSrc(p)).catch(() => '');
}

function bar() {
  let b = $('cosmosBar');
  if (!b) {
    b = el('div', { id: 'cosmosBar' },
      el('span', { class: 'cd-cosmos-title' }),
      el('button', { class: 'ghost cd-back', onclick: () => openCosmos(ctxRef) }, 'Назад в космос'),
      el('button', { class: 'ghost', title: 'Список сновидцев', onclick: () => { $('dreamers').hidden = !$('dreamers').hidden; } }, 'Сновидцы'),
      el('button', { onclick: () => closeCosmos() }, 'Моя карта'));
    document.body.append(b);
  }
  return b;
}

function dreamersPanel() {
  let p = $('dreamers');
  if (!p) { p = el('div', { id: 'dreamers' }); document.body.append(p); }
  p.replaceChildren(el('div', { class: 'sect' }, 'Сновидцы'),
    ...users.map(u => el('div', { class: 'u' + (cur && Number(cur.id) === Number(u.id) ? ' on' : ''),
      onclick: () => openUser(ctxRef, Number(u.id)) },
      el('span', {}, (MARK[u.role] || '☾') + ' ' + u.login), el('span', { class: 'n' }, String(u.n)))));
  return p;
}

function setTitle(text, inUser) {
  const b = bar();
  b.hidden = false;
  b.querySelector('.cd-cosmos-title').textContent = text;
  b.querySelector('.cd-back').hidden = !inUser;
}

export async function openCosmos(ctx) {
  ctxRef = ctx;
  let r;
  try { r = await api.site('cosmos'); } catch (e) { ctx.ui.toast('Космос: ' + errText(e)); return; }
  mode = 'cosmos'; cur = null;
  closeForeignCard();
  users = r.users || [];
  const me = currentUser();
  const pairs = {};   // мосты пары сновидцев складываются в одну нить
  for (const b of r.bridges || []) {
    const ua = Number(b.ua), ub = Number(b.ub);
    const k = Math.min(ua, ub) + ':' + Math.max(ua, ub);
    if (!pairs[k]) pairs[k] = { a: 'U:' + ua, b: 'U:' + ub, type: b.type };
  }
  showForeign({
    nodes: users.map((u, i) => ({
      id: 'U:' + u.id, planet: true, cluster: i, pos: [0, 0, 0],
      founded: me && Number(u.id) === Number(me.id), rings: RANK[u.role] || 1,
      label: (MARK[u.role] || '☾') + ' ' + u.login + ' · ' + u.n,
    })),
    edges: Object.values(pairs).map((p, i) => ({ id: 'B' + i, a: p.a, b: p.b, type: p.type, cross: true })),
    clusters: users.length, bridges: true,
    handlers: { onSelect: id => { if (String(id).startsWith('U:')) openUser(ctx, Number(String(id).slice(2))); } },
  });
  setTitle('Космос сновидцев', false);
  dreamersPanel().hidden = narrow();
}

// карта сновидца с сайта → узлы и нити (планета — от двух снов или с книгой-фундаментом)
function buildUserMap(r) {
  const founded = new Set((r.founded || []).map(locKey));
  const nodes = [], edges = [], byId = {};
  for (const x of r.dreams) {
    const n = { id: Number(x.id), label: x.title, cluster: 0,
      pos: x.pos_x != null ? [parseFloat(x.pos_x), parseFloat(x.pos_y), parseFloat(x.pos_z)] : null,
      image: x.image_file ? siteImg(x.image_file) : null };
    nodes.push(n); byId[n.id] = n;
  }
  for (const l of r.links || [])
    if (l.type !== 'локация') edges.push({ id: 'l' + l.id, a: Number(l.dream_a), b: Number(l.dream_b), type: l.type });
  const planetPos = {};
  for (const p of r.planets || []) if (p.x != null) planetPos[p.loc_key] = [parseFloat(p.x), parseFloat(p.y), parseFloat(p.z)];
  const groups = new Map();
  for (const x of r.dreams) {
    const k = locKey(x.location);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, { name: String(x.location).trim(), items: [] });
    groups.get(k).items.push(x);
  }
  for (const [k, g] of groups) {
    if (g.items.length < 2 && !founded.has(k)) { for (const x of g.items) byId[Number(x.id)].sub = g.name; continue; }
    nodes.push({ id: 'P:' + k, label: g.name, planet: true, founded: founded.has(k), cluster: 0, pos: planetPos[k] || null });
    for (const x of g.items) edges.push({ id: 'pe' + x.id, a: 'P:' + k, b: Number(x.id), type: 'локация' });
  }
  return { nodes, edges };
}

export async function openUser(ctx, uid) {
  ctxRef = ctx;
  const me = currentUser();
  if (me && uid === Number(me.id) && !linking()) { closeCosmos(); return; }
  const t = users.find(u => Number(u.id) === uid);
  if (t && me && Number(t.id) !== Number(me.id) && (RANK[me.role] || 0) <= (RANK[t.role] || 0)) {
    ctx.ui.toast('Карта ' + t.login + ' вам недоступна'); return;
  }
  let r;
  try { r = await api.site('user_map&uid=' + uid); } catch (e) { ctx.ui.toast(errText(e)); return; }
  mode = 'user'; cur = r.user;
  r.dreams = (r.dreams || []).map(x => ({ ...x, id: Number(x.id), _login: cur.login }));
  const { nodes, edges } = buildUserMap(r);
  const reloadUser = () => openUser(ctx, Number(cur.id));
  showForeign({ nodes, edges, clusters: 1, handlers: {
    onSelect(id) {
      if (String(id).startsWith('P:')) return;   // планета — не сон
      const d = r.dreams.find(x => x.id === Number(id));
      if (!d) return;
      if (linking()) { finishLink(ctx, d, reloadUser); return; }
      openForeignCard(ctx, d, r, reloadUser);
    },
    onMove(m) {   // вышестоящий правит авторские координаты сновидца
      const id = String(m.id);
      const call = id.startsWith('P:')
        ? api.site('save_planet_positions', { uid: cur.id, items: [{ loc: id.slice(2), x: m.x, y: m.y, z: m.z }] })
        : api.site('save_positions', { uid: cur.id, items: [{ id: Number(id), x: m.x, y: m.y, z: m.z }] });
      call.catch(e => ctx.ui.toast(errText(e)));
    },
    async onAlign(pid) {
      const key = String(pid).slice(2);
      const sats = r.dreams.filter(x => locKey(x.location) === key);
      if (!sats.length) return;
      try {
        await api.site('save_positions', { uid: cur.id, items: sats.map(x => ({ id: x.id })) });
        ctx.ui.toast('Орбиты выровнены');
        reloadUser();
      } catch (e) { ctx.ui.toast(errText(e)); }
    },
  } });
  setTitle('Карта сновидца: ' + (MARK[cur.role] || '☾') + ' ' + cur.login, true);
  dreamersPanel();
}

export function closeCosmos() {
  if (!mode) return;
  mode = null; cur = null;
  closeForeignCard();
  if ($('cosmosBar')) $('cosmosBar').hidden = true;
  if ($('dreamers')) $('dreamers').hidden = true;
  showOwn();
}
