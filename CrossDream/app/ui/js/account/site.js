// Окно «⛅ Сайт»: вход и регистрация по инвайту, сервер, выход. Синхронизация — сама (ядро), без кнопок.
// После входа: ui.showUser(user) и bus 'user:changed'. При запуске — site_state.
import * as api from '../shell/api.js';
import { $, el } from '../shell/ui.js';
import { showModal, hideModal, isOpen, ask, row } from '../dreams/modal.js';
import { errText } from '../dreams/util.js';

export const DEFAULT_SERVER = 'https://dream.globthe.top';
const ROLE = { owner: 'владелец', admin: 'админ', moder: 'модер', user: 'сновидец' };
let me = null, server = DEFAULT_SERVER, syncing = false;

export const currentUser = () => me;

export function applyUser(ctx, user, srv) {
  me = user || null;
  if (srv) server = srv;
  ctx.ui.showUser(me);
  const r = $('whoRole');
  if (r) r.className = me ? 'r-' + me.role : '';
  ctx.status.say(me ? 'сайт: ' + me.login + ' · ' + server.replace(/^https?:\/\//, '') : 'сайт не подключён');
  ctx.bus.emit('user:changed', me);
  gate(ctx);
}

// сайт: без входа — только форма входа на всё окно (body.cd-gate прячет остальное); вошли — вся программа
const WEB = !!window.__CD_WEB__;
function gate(ctx) {
  if (!WEB) return;
  const was = document.body.classList.contains('cd-gate');
  document.body.classList.toggle('cd-gate', !me);
  if (!me) openSite(ctx);
  else if (was) { hideModal('cdSite'); $('tabMap').click(); }
}

export async function startup(ctx) {
  try {
    const s = await api.invoke('site_state');
    applyUser(ctx, s && s.user, s && s.server);
  } catch (e) {
    applyUser(ctx, null);
  }
}

// внеочередная сверка (после входа, после принятого дара) — тихо, итог в строке состояния
export async function syncAll(ctx, btn) {
  if (syncing) return;
  syncing = true;
  if (btn) btn.disabled = true;
  try {
    await api.invoke('sync_all');   // ход и итог — в строке состояния
    ctx.bus.emit('dreams:reload');
  } catch (e) {
    ctx.status.done(false, errText(e));
    ctx.ui.toast('Синхронизация: ' + errText(e));
  } finally {
    syncing = false;
    if (btn) btn.disabled = false;
  }
}

function loggedIn(ctx, box) {
  const out = el('button', { class: 'ghost danger', onclick: async () => {
    const ok = await ask('Забыть логин и пароль на этом устройстве? Сны, книги и картинки останутся на месте; ' +
      'толкование через ИИ, космос и дары станут недоступны до следующего входа.',
      { title: 'Выход из аккаунта', ok: 'Выйти', danger: true });
    if (!ok) return;
    try { await api.invoke('site_logout'); } catch (e) { ctx.ui.toast(errText(e)); }
    applyUser(ctx, null);
    if (isOpen('cdSite')) openSite(ctx);
  } }, 'Выйти');
  box.append(
    el('p', { class: 'cd-ok' }, 'Вы вошли как ' + me.login + ' · ' + (ROLE[me.role] || me.role)),
    el('p', { class: 'note' }, 'Сервер: ' + server),
    el('p', { class: 'note' }, 'Всё сверяется с сайтом само: при входе, через несколько секунд после ваших правок ' +
      'и раз в пять минут. Ход — в строке внизу окна.'),
    el('div', { class: 'cd-gap' }),
    el('div', { class: 'cd-choices' },
      el('button', { onclick: () => $('btnGifts').click() }, 'Ларец даров'),
      el('button', { onclick: () => $('btnTrust').click() }, 'Доверие'))
  );
  return out;
}

function loginForm(ctx, box) {
  let reg = false;
  const tabIn = el('button', { class: 'on' }, 'Вход');
  const tabReg = el('button', {}, 'Регистрация');
  const url = el('input', { type: 'text', placeholder: DEFAULT_SERVER });
  url.value = server;
  const login = el('input', { type: 'text', autocomplete: 'username' });
  const pass = el('input', { type: 'password', autocomplete: 'current-password' });
  const invite = el('input', { type: 'text', placeholder: 'код приглашения' });
  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'необязательно' });
  const inviteBox = el('div', { hidden: true }, el('label', {}, 'ИНВАЙТ'), invite,
    el('label', {}, 'ПОЧТА — чтобы восстановить пароль, если забудете'), email);
  const remember = el('input', { type: 'checkbox', checked: true });
  const msg = el('div', { class: 'note cd-result' });
  const go = el('button', { class: 'primary cd-wide' }, 'Войти');
  const setTab = r => {
    reg = r;
    tabIn.classList.toggle('on', !r); tabReg.classList.toggle('on', r);
    inviteBox.hidden = !r;
    go.textContent = r ? 'Зарегистрироваться' : 'Войти';
  };
  tabIn.onclick = () => setTab(false);
  tabReg.onclick = () => setTab(true);
  const submit = async () => {
    if (!login.value.trim() || !pass.value) { msg.textContent = 'Впишите логин и пароль'; return; }
    if (reg && !invite.value.trim()) { msg.textContent = 'Регистрация — только по инвайту'; return; }
    go.disabled = true; msg.textContent = 'Подключаюсь…';
    try {
      const srv = url.value.trim() || DEFAULT_SERVER;
      const user = await api.invoke('site_login', {
        server: srv, login: login.value.trim(), pass: pass.value,
        invite: reg ? invite.value.trim() : null, remember: remember.checked,
      });
      if (reg && email.value.trim())   // почта не мешает регистрации: не прошла — впишут в настройках
        try { await api.site('set_email', { email: email.value.trim() }); user.email = email.value.trim(); }
        catch (e) { ctx.ui.toast('Почта не сохранилась: ' + errText(e)); }
      applyUser(ctx, user, srv);
      openSite(ctx);
      syncAll(ctx);   // свой набор снов, книг и палитры — сразу с сайта
    } catch (e) { msg.textContent = errText(e); }
    go.disabled = false;
  };
  go.onclick = submit;
  pass.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  box.append(
    el('p', { class: 'note' }, window.__CD_WEB__
      ? 'Войдите, чтобы открыть свою карту снов, библиотеку и гадания — те же, что в программе.'
      : 'Без входа программа работает сама по себе. Вход открывает толкование снов ' +
        'через ИИ, синхронизацию между устройствами, дары и доверие.'),
    el('div', { class: 'tabbtns' }, tabIn, tabReg),
    ...(window.__CD_WEB__ ? [] : [el('label', {}, 'СЕРВЕР'), url]),   // на сайте адрес свой
    el('label', {}, 'ЛОГИН'), login,
    el('label', {}, 'ПАРОЛЬ'), pass,
    inviteBox,
    el('label', { class: 'remember' }, remember, 'запомнить это устройство'),
    el('div', { class: 'cd-gap' }), go, msg, forgotBox());
  setTimeout(() => login.focus(), 40);
  return null;
}

// «Забыли пароль?»: письмо со ссылкой на почту аккаунта (ссылка открывается в браузере, живёт час)
function forgotBox() {
  const who = el('input', { type: 'text', placeholder: 'логин или почта', autocomplete: 'username' });
  const note = el('div', { class: 'note cd-result' });
  const send = el('button', {}, 'Прислать ссылку');
  const box = el('div', { hidden: true }, el('label', {}, 'ВОССТАНОВЛЕНИЕ ДОСТУПА'), who, el('div', { class: 'cd-gap' }), send, note);
  send.onclick = async () => {
    if (!who.value.trim()) { note.textContent = 'Впишите логин или почту'; return; }
    send.disabled = true;
    try { note.textContent = (await api.site('reset_request', { who: who.value.trim() })).message; }
    catch (e) { note.textContent = errText(e); }
    send.disabled = false;
  };
  const link = el('button', { class: 'ghost', onclick: () => { box.hidden = !box.hidden; if (!box.hidden) who.focus(); } },
    'Забыли пароль?');
  return el('div', {}, link, box);
}

export function openSite(ctx) {
  const gated = WEB && !me;   // сайт без входа: форма входа — единственное, что есть; закрыть её нельзя
  const { ov, box, close } = showModal('cdSite', 460);
  box.append(el('h2', {}, gated ? 'Карта снов' : 'Сайт'));
  const extra = me ? loggedIn(ctx, box) : loginForm(ctx, box);
  box.append(row(extra, gated ? null : el('button', { class: 'ghost', onclick: close }, 'Закрыть')));
  if (gated) ov._onClose = () => { if (document.body.classList.contains('cd-gate')) setTimeout(() => openSite(ctx), 0); };
}
