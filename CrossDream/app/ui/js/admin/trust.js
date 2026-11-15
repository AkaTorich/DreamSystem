// Связи доверия 🤝: взаимные и отзываемые. Доверенные дарят друг другу;
// автоприём кладёт их дары на полку без вопросов.
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import { showModal, isOpen, row } from '../dreams/modal.js';
import { errText } from '../dreams/util.js';

async function act(ctx, fn) {
  try { await fn(); } catch (e) { ctx.ui.toast(errText(e)); }
  if (isOpen('cdTrust')) openTrust(ctx);
}

function trustRow(ctx, t) {
  const btn = (label, f, cls = 'ghost', title = null) => el('button', { class: cls, title, onclick: f }, label);
  const decide = accept => act(ctx, () => api.site('trust_decide', { id: t.id, accept }));
  const revoke = () => act(ctx, () => api.site('trust_revoke', { id: t.id }));
  if (t.status === 'pending' && Number(t.incoming))
    return el('div', { class: 'link-row cd-gift' },
      el('span', { class: 'cd-grow' }, el('b', {}, t.other), ' предлагает доверие'),
      el('span', { class: 'cd-gift-btns' }, btn('Принять', () => decide(true)), btn('отклонить', () => decide(false), 'ghost danger')));
  if (t.status === 'pending')
    return el('div', { class: 'link-row cd-gift' },
      el('span', { class: 'cd-grow' }, t.other + ' — ждёт ответа'),
      el('span', { class: 'cd-gift-btns' }, btn('отменить', revoke, 'ghost danger')));
  const auto = Number(t.my_auto) ? 1 : 0;
  return el('div', { class: 'link-row cd-gift' },
    el('span', { class: 'cd-grow' }, el('b', {}, t.other), ' ', el('span', { class: 'lr' }, 'доверие взаимно')),
    el('span', { class: 'cd-gift-btns' },
      btn(auto ? 'Автоприём: вкл' : 'Автоприём: выкл',
        () => act(ctx, () => api.site('trust_auto', { id: t.id, auto: auto ? 0 : 1 })), 'ghost',
        'Автоприём: дары этого сновидца ложатся на полку без вопросов'),
      btn('Отозвать', revoke, 'ghost danger', 'Отозвать доверие')));
}

export async function openTrust(ctx) {
  let r;
  try { r = await api.site('trusts_list'); } catch (e) { ctx.ui.toast('Доверие: ' + errText(e)); return; }
  const { box, close } = showModal('cdTrust', 600);
  const login = el('input', { type: 'text', placeholder: 'логин сновидца' });
  const offer = () => act(ctx, async () => {
    if (!login.value.trim()) return;
    const x = await api.site('trust_request', { login: login.value.trim() });
    ctx.ui.toast('Доверие предложено: ' + ((x && x.to) || login.value.trim()));
  });
  login.addEventListener('keydown', e => { if (e.key === 'Enter') offer(); });
  const rows = (r.trusts || []).map(t => trustRow(ctx, t));
  box.append(el('h2', {}, 'Доверие'),
    el('p', { class: 'note' }, 'Доверие взаимно и отзываемо. Доверенные могут дарить друг другу; ' +
      'автоприём кладёт их дары на полку без вопросов.'),
    el('div', { class: 'cd-inline' }, login, el('button', { class: 'primary', onclick: offer }, 'Предложить')),
    el('div', { class: 'sect' }, 'СВЯЗИ'),
    ...(rows.length ? rows : [el('p', { class: 'note' }, 'Связей доверия пока нет.')]),
    row(el('button', { class: 'ghost', onclick: close }, 'Закрыть')));
}
