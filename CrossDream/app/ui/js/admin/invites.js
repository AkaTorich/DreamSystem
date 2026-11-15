// Инвайты: свои и своей ветки. Создать (код сразу в буфер), скопировать свободный,
// удалить неиспользованный; владелец может подчистить летопись использованных.
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import { ask } from '../dreams/modal.js';
import { errText } from '../dreams/util.js';
import { currentUser } from '../account/site.js';

async function copy(ctx, code) {
  try { await navigator.clipboard.writeText(code); ctx.ui.toast('Скопировано: ' + code); }
  catch (e) { ctx.ui.toast('Инвайт: ' + code); }
}

export async function renderInvites(ctx, box) {
  let r;
  try { r = await api.site('invites_list'); }
  catch (e) { box.replaceChildren(el('p', { class: 'note' }, 'Инвайты не загрузились: ' + errText(e))); return; }
  const again = () => renderInvites(ctx, box);
  const rows = (r.invites || []).map(i => {
    const used = !!i.used_at;
    const code = el('b', { class: 'cd-code' + (used ? ' used' : ''), title: used ? null : 'Нажмите, чтобы скопировать' }, i.code);
    if (!used) code.addEventListener('click', () => copy(ctx, i.code));
    const info = used
      ? 'использован: ' + (i.used_login || 'неизвестно кем') + (Number(i.gone) === 1 ? ' · сновидец удалён' : '')
      : 'свободен · выдал ' + (i.creator || '—');
    return el('div', { class: 'cd-invite' }, code, el('span', { class: 'n' }, info),
      used ? el('span') : el('button', { class: 'ghost danger', title: 'Удалить неиспользованный', onclick: async () => {
        try { await api.site('invite_del', { id: i.id }); } catch (e) { ctx.ui.toast(errText(e)); }
        again();
      } }, 'Удалить'));
  });
  const create = el('button', { onclick: async () => {
    try { const x = await api.site('invite_create'); await copy(ctx, x.code); }
    catch (e) { ctx.ui.toast(errText(e)); }
    again();
  } }, 'Создать инвайт');
  const tools = el('div', { class: 'cd-choices' }, create);
  const me = currentUser();
  if (me && me.role === 'owner')
    tools.append(el('button', { class: 'ghost danger', title: 'Убрать из списка все использованные инвайты', onclick: async () => {
      if (!await ask('Убрать из списка ВСЕ использованные инвайты? Сами сновидцы останутся — исчезнет лишь запись о входе.',
        { title: 'Подчистить инвайты', ok: 'Убрать', danger: true })) return;
      try { const x = await api.site('invites_purge'); ctx.ui.toast('Убрано записей: ' + x.removed); }
      catch (e) { ctx.ui.toast(errText(e)); }
      again();
    } }, 'Очистить использованные'));
  box.replaceChildren(...(rows.length ? rows : [el('p', { class: 'note' }, 'Инвайтов пока нет — создайте первый.')]), tools);
}
