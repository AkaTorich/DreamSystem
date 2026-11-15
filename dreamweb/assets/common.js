'use strict';
const LINK_COLORS = {
  'локация': '#7dd3fc', 'персонаж': '#f9a8d4', 'эмоция': '#fca5a5',
  'символ': '#fcd34d', 'сюжет': '#a5b4fc'
};

async function api(action, data, files) {
  let opt;
  if (files) { opt = { method: 'POST', body: files }; }
  else if (data !== undefined) {
    opt = { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data) };
  } else opt = {};
  const r = await fetch('api.php?action=' + action, opt);
  const j = await r.json().catch(() => ({ error: 'Сервер вернул не-JSON' }));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}

let _toastT = null;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.style.display = 'none', 5500);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ===== дары и доверие (общие для всех страниц) ===== */
function _mkOverlay(id) {
  let ov = document.getElementById(id);
  if (ov) return ov;
  ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = id;
  document.body.appendChild(ov);
  return ov;
}
const GIFT_ICON = { book: '𓏛', pdf: '📕', file: '⚙' };

async function refreshGiftBadge() {
  try {
    const r = await api('gifts_list');
    const b = document.getElementById('giftBadge');
    if (b) b.textContent = r.count ? ' ' + r.count : '';
    return r;
  } catch (e) { return null; }
}

async function openGifts() {
  const r = await api('gifts_list');
  const ov = _mkOverlay('giftsOv');
  // лик дара: своя иконка продукта или знак его рода
  const face = g => g.has_icon
    ? `<img src="api.php?action=gift_icon&id=${g.id}" alt=""
         style="width:38px;height:38px;object-fit:contain;flex:0 0 38px">`
    : `<span style="font-size:26px;flex:0 0 38px;text-align:center">${GIFT_ICON[g.item_type] || '🎁'}</span>`;
  const about = g => (g.note ? `<span class="lr">${esc(g.note)}</span>` : '') +
    (g.descr ? `<div style="font-size:12px;color:var(--faint);line-height:1.45;margin-top:3px">${esc(g.descr)}</div>` : '');
  const inc = r.incoming.map(g => `
    <div class="link-row" style="cursor:default; align-items:flex-start; gap:10px">
      ${face(g)}
      <span style="flex:1">
        <b>${esc(g.from_login)}</b> дарит «${esc(g.title)}» ${about(g)}
        ${g.message ? `<div style="font-size:12px;color:var(--faint);margin-top:3px">— «${esc(g.message)}»</div>` : ''}
      </span>
      <span style="margin-left:auto; white-space:nowrap">
        <button class="ghost" onclick="decideGift(${g.id}, true)">✅ принять</button>
        <button class="ghost danger" onclick="decideGift(${g.id}, false)">отклонить</button>
        <button class="ghost" onclick="devourGift(${g.id})"
          title="Скормить чёрной дыре — нейтрализовать без следа">🕳</button>
      </span>
    </div>`).join('') || '<p class="note">Новых даров нет.</p>';
  const acc = (r.accepted || []).map(g => `
    <div class="link-row" style="cursor:default; align-items:flex-start; gap:10px">
      ${face(g)}
      <span style="flex:1">«${esc(g.title)}» от ${esc(g.from_login)} ${about(g)}</span>
      <span style="margin-left:auto; white-space:nowrap">
        <button class="ghost" onclick="devourGift(${g.id})"
          title="Разонравился — чёрная дыра сотрёт его с вашей полки">🕳 скормить дыре</button>
      </span>
    </div>`).join('') || '<p class="note">Принятых даров на полках нет.</p>';
  const st = { pending: '⌛ ожидает', accepted: '✅ принят', declined: '✖ отклонён',
               devoured: '🕳 поглощён дырой' };
  const out = r.outgoing.map(g => `
    <div class="link-row" style="cursor:default">
      <span>${GIFT_ICON[g.item_type] || '🎁'} «${esc(g.title)}» → ${esc(g.to_login)}</span>
      <span class="lr" style="margin-left:auto">${st[g.status] || g.status}</span>
    </div>`).join('') || '<p class="note">Вы пока ничего не дарили.</p>';
  ov.innerHTML = `<div class="modal" style="width:660px">
    <h2>🎁 Ларец даров</h2>
    <div class="sect">ВАМ ПРЕДЛАГАЮТ</div>${inc}
    <div class="sect" style="margin-top:16px">ПРИНЯТЫЕ ДАРЫ — ЕЩЁ МОЖНО СКОРМИТЬ ДЫРЕ</div>${acc}
    <div class="sect" style="margin-top:16px">ВАШИ ДАРЫ</div>${out}
    <div class="mrow"><button class="ghost" onclick="document.getElementById('giftsOv').classList.remove('open')">Закрыть</button></div>
  </div>`;
  ov.classList.add('open');
}
async function decideGift(id, accept) {
  try {
    const r = await api('gift_decide', { id, accept });
    toast(r.accepted ? 'Дар принят — вещь на вашей полке' : 'Дар отклонён');
  } catch (e) { toast(e.message); }
  openGifts(); refreshGiftBadge();
  if (typeof reload === 'function') reload();
}
async function devourGift(id) {
  try {
    await api('gift_devour', { id });
    const bh = document.getElementById('blackHole');
    if (bh) { // дыра сглатывает подношение
      bh.classList.add('feeding');
      setTimeout(() => bh.classList.remove('feeding'), 1400);
    }
    toast('🕳 Чёрная дыра приняла подношение — дара больше нет');
  } catch (e) { toast(e.message); }
  openGifts(); refreshGiftBadge();
  if (typeof reload === 'function') reload();
}

/* чёрная дыра в углу: не кнопка, а место — сюда падают скормленные дары */
function startBlackHole() {
  if (document.getElementById('blackHole')) return;
  const bh = document.createElement('div');
  bh.id = 'blackHole';
  bh.title = 'Чёрная дыра: сюда падают скормленные дары';
  bh.innerHTML = '<div class="bh-ring"></div><div class="bh-core"></div>';
  document.body.appendChild(bh);
}

async function openTrust() {
  const r = await api('trusts_list');
  const ov = _mkOverlay('trustOv');
  const rows = r.trusts.map(t => {
    if (t.status === 'pending' && t.incoming)
      return `<div class="link-row" style="cursor:default">
        <span>🤝 <b>${esc(t.other)}</b> предлагает доверие</span>
        <span style="margin-left:auto; white-space:nowrap">
          <button class="ghost" onclick="trustDecide(${t.id}, true)">✅ принять</button>
          <button class="ghost danger" onclick="trustDecide(${t.id}, false)">отклонить</button>
        </span></div>`;
    if (t.status === 'pending')
      return `<div class="link-row" style="cursor:default">
        <span>⌛ ${esc(t.other)} — ждёт ответа</span>
        <span style="margin-left:auto"><button class="ghost danger" onclick="trustRevoke(${t.id})">отменить</button></span></div>`;
    return `<div class="link-row" style="cursor:default">
      <span>🤝 <b>${esc(t.other)}</b></span>
      <span class="lr">доверие взаимно</span>
      <span style="margin-left:auto; white-space:nowrap">
        <button class="ghost" onclick="trustAuto(${t.id}, ${t.my_auto ? 0 : 1})"
          title="Автоприём: дары этого сновидца ложатся на полку без вопросов">
          ${t.my_auto ? '⚡ автоприём вкл' : 'автоприём выкл'}</button>
        <button class="ghost danger" onclick="trustRevoke(${t.id})" title="Отозвать доверие">✕</button>
      </span></div>`;
  }).join('') || '<p class="note">Связей доверия пока нет.</p>';
  ov.innerHTML = `<div class="modal" style="width:600px">
    <h2>🤝 Доверие</h2>
    <p class="note">Доверие взаимно и отзываемо. Доверенные могут дарить друг другу;
      автоприём кладёт их дары на полку без вопросов.</p>
    <div style="display:flex; gap:8px; margin-top:10px">
      <input type="text" id="trustLogin" placeholder="логин сновидца" style="flex:1">
      <button class="primary" onclick="trustReq()">Предложить</button>
    </div>
    <div class="sect" style="margin-top:16px">СВЯЗИ</div>${rows}
    <div class="mrow"><button class="ghost" onclick="document.getElementById('trustOv').classList.remove('open')">Закрыть</button></div>
  </div>`;
  ov.classList.add('open');
}
async function trustReq() {
  try {
    const r = await api('trust_request', { login: document.getElementById('trustLogin').value });
    toast('Доверие предложено: ' + r.to);
  } catch (e) { toast(e.message); }
  openTrust();
}
async function trustDecide(id, accept) {
  try { await api('trust_decide', { id, accept }); } catch (e) { toast(e.message); }
  openTrust();
}
async function trustRevoke(id) {
  try { await api('trust_revoke', { id }); } catch (e) { toast(e.message); }
  openTrust();
}
async function trustAuto(id, auto) {
  try { await api('trust_auto', { id, auto }); } catch (e) { toast(e.message); }
  openTrust();
}

/* звёздное небо */
function startSky(canvasId) {
  const c = document.getElementById(canvasId), x = c.getContext('2d');
  let stars = [];
  function resize() {
    c.width = innerWidth; c.height = innerHeight;
    stars = Array.from({ length: Math.floor(innerWidth * innerHeight / 6500) }, () => ({
      x: Math.random() * c.width, y: Math.random() * c.height,
      r: Math.random() * 1.3 + .2, a: .25 + Math.random() * .75
    }));
    draw();
  }
  function draw() {
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#0b0722'); g.addColorStop(.6, '#070512'); g.addColorStop(1, '#05030c');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    const blobs = [[c.width * .25, c.height * .2, c.width * .3, '43,30,107'],
                   [c.width * .8, c.height * .8, c.width * .25, '18,58,82'],
                   [c.width * .5, c.height * .75, c.width * .18, '74,29,94']];
    for (const [bx, by, br, col] of blobs) {
      const rg = x.createRadialGradient(bx, by, 0, bx, by, br);
      rg.addColorStop(0, 'rgba(' + col + ',0.35)'); rg.addColorStop(1, 'rgba(' + col + ',0)');
      x.fillStyle = rg; x.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    for (const s of stars) {
      x.globalAlpha = s.a;                 // своя яркость у каждой, но она не пульсирует
      x.fillStyle = '#cfd8ff';
      x.beginPath(); x.arc(s.x, s.y, s.r, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
  }
  // небо стоит спокойно: рисуется один раз и заново только при смене размера окна
  resize(); addEventListener('resize', resize);
}
