// «👥 Пользователи»: своя ветка сновидцев — ник, роль, доступ к ИИ, пароль, бан, удаление.
// Правит админ и выше, и только тех, кто строго ниже рангом (сервер проверяет сам).
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import { showModal, isOpen, row, ask, askText, choose } from '../dreams/modal.js';
import { errText } from '../dreams/util.js';
import { currentUser } from '../account/site.js';
import { renderInvites } from './invites.js';

export const RANK = { user: 1, moder: 2, admin: 3, owner: 4 };
export const ROLE_NAME = { user: 'сновидец', moder: 'модер', admin: 'админ', owner: 'владелец' };

async function act(ctx, fn, okText) {
  try { await fn(); if (okText) ctx.ui.toast(okText); }
  catch (e) { ctx.ui.toast(errText(e)); }
  if (isOpen('cdUsers')) fillUsers(ctx);
}

async function setKey(ctx, u) {
  const has = Number(u.has_key) === 1;
  const v = await choose('Доступ к ИИ · ' + u.login,
    has ? (Number(u.key_issued) === 1 ? 'Доступ выдан вами или админом.' : 'Пользователь вписал свой ключ.')
      : 'У пользователя нет ключа ИИ.',
    [{ label: 'Выдать мой ключ', value: 'mine', cls: 'primary' }, { label: 'Вставить другой ключ', value: 'other' }]
      .concat(has ? [{ label: 'Отозвать доступ', value: 'revoke', cls: 'danger' }] : []));
  if (!v) return;
  if (v === 'mine') return act(ctx, () => api.site('user_set_key', { id: u.id, use_mine: 1 }), 'Доступ к ИИ выдан — ваш ключ передан');
  if (v === 'revoke') return act(ctx, () => api.site('user_set_key', { id: u.id, key: '' }), 'Доступ отозван');
  const k = await askText('Ключ OpenRouter', 'Ключ для ' + u.login + ' (sk-or-v1-…)', '', { ok: 'Выдать' });
  if (k && k.trim()) act(ctx, () => api.site('user_set_key', { id: u.id, key: k.trim() }), 'Доступ к ИИ выдан');
}

function userRow(ctx, u, me) {
  const my = RANK[me.role] || 0;
  const self = Number(u.id) === Number(me.id);
  const over = my >= 3 && my > (RANK[u.role] || 0);
  const can = self || over;
  const name = el('input', { type: 'text', disabled: !can, title: 'Изменить ник и нажать Enter' });
  name.value = u.login;
  name.addEventListener('change', () => act(ctx, () => api.site('user_rename', { id: u.id, login: name.value.trim() }), 'Ник изменён'));
  let role;
  if (self || !over) role = el('span', { class: 'chip cd-role' }, ROLE_NAME[u.role] || u.role);
  else {
    role = el('select', { title: 'Назначить роль' },
      Object.keys(ROLE_NAME).filter(k => RANK[k] < my).map(k =>
        el('option', { value: k, selected: u.role === k }, ROLE_NAME[k])));
    role.addEventListener('change', () => act(ctx, () => api.site('user_set_role', { id: u.id, role: role.value }), 'Роль: ' + ROLE_NAME[role.value]));
  }
  const banned = Number(u.banned) === 1;
  const b = (label, title, f, ok, cls = 'ghost') => el('button', { class: cls, title, disabled: !ok, onclick: f }, label);
  return el('div', { class: 'cd-user' + (banned ? ' banned' : '') },
    el('div', { class: 'cd-user-main' }, name, role),
    el('div', { class: 'cd-user-info' },
      el('span', { class: 'n', title: 'кто привёл' }, u.parent_login ? '← ' + u.parent_login : 'корень'),
      el('span', { class: 'n', title: 'снов на карте' }, 'снов: ' + (u.dreams ?? 0))),
    el('div', { class: 'cd-user-btns' },
      b(Number(u.has_key) === 1 ? 'ИИ: есть' : 'ИИ: нет', 'Доступ к ИИ', () => setKey(ctx, u), can),
      b('Пароль', 'Задать новый пароль', async () => {
        const p = await askText('Новый пароль · ' + u.login, 'Не короче 6 символов.', '', { ok: 'Задать' });
        if (p) act(ctx, () => api.site('user_set_pass', { id: u.id, pass: p }), 'Пароль задан');
      }, can),
      b(banned ? 'Разбанить' : 'Бан', (RANK[u.role] || 0) >= 3 ? 'Админа забанить нельзя' : 'Заблокировать или снять блокировку',
        () => act(ctx, () => api.site('user_ban', { id: u.id, banned: banned ? 0 : 1 })),
        !self && over && (RANK[u.role] || 0) < 3, banned ? 'ghost' : 'ghost danger'),
      b('Удалить', 'Удалить со всеми снами', async () => {
        if (await ask('Удалить сновидца «' + u.login + '» со всеми его снами и связями?', { title: 'Удалить сновидца', ok: 'Удалить', danger: true }))
          act(ctx, () => api.site('user_delete', { id: u.id }), 'Удалён');
      }, !self && over, 'ghost danger')));
}

let listBox = null;

async function fillUsers(ctx) {
  const me = currentUser();
  if (!me || !listBox) return;
  try {
    const r = await api.site('users_list');
    listBox.replaceChildren(...(r.users || []).map(u => userRow(ctx, u, me)));
  } catch (e) { listBox.replaceChildren(el('p', { class: 'note' }, 'Список не загрузился: ' + errText(e))); }
}

export async function openUsers(ctx) {
  if (!currentUser()) { ctx.ui.toast('Сначала войдите (вкладка «Сайт»)'); return; }
  const { box, close } = showModal('cdUsers', 800);
  listBox = el('div', { class: 'cd-users' }, el('p', { class: 'note' }, 'Загружаю…'));
  const inv = el('div', { class: 'cd-invites' });
  box.append(el('h2', {}, 'Пользователи'), listBox,
    el('div', { class: 'sect' }, 'ИНВАЙТЫ — ВХОД ТОЛЬКО ПО НИМ'), inv,
    row(el('button', { class: 'ghost', onclick: close }, 'Закрыть')));
  await fillUsers(ctx);
  renderInvites(ctx, inv);
}
