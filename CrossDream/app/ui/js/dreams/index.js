// Область «Дневник»: запись сна, список, карточка, импорт.
// Кнопки: btnNew, btnList, menuImport. Шина: dream:open, ui:escape, app:ready;
// своё (между моими областями): dreams:close-left.
import * as store from './store.js';
import { makeDrawer } from './panels.js';
import { closeTop, escapeOthers } from './modal.js';
import { addCss } from './util.js';
import { showForm } from './form.js';
import { showList, refreshList, listShown } from './list.js';
import { renderCard, currentDream, forgetCard } from './card.js';
import { openImport } from './import.js';

export async function init(ctx) {
  addCss('css/dreams.css');
  store.init(ctx);
  const left = makeDrawer('cdLeft', 'left');
  const right = makeDrawer('cdRight', 'right');
  right.onClose = () => forgetCard();

  ctx.ui.onTop('btnNew', () => showForm(ctx, left));
  ctx.ui.onTop('btnList', () => {
    if (listShown(left)) { left.close(); return; }
    showList(ctx, left);
  });
  ctx.ui.onTop('menuImport', () => openImport(ctx));

  ctx.bus.on('dream:open', id => {
    if (!renderCard(ctx, right, id)) ctx.ui.toast('Этого сна больше нет');
  });
  ctx.bus.on('dreams:close-left', () => left.close());

  // сны перечитаны: обновить список и открытую карточку
  store.onChange(() => {
    refreshList(ctx, left);
    const id = currentDream();
    if (id && right.isOpen()) {
      if (!renderCard(ctx, right, id)) right.close();
    }
  });

  // Esc: сперва верхнее окно, потом карточка, потом левая панель
  ctx.bus.on('ui:escape', () => {
    if (closeTop()) return;
    if (right.isOpen()) { right.close(); return; }
    if (escapeOthers()) return;
    left.close();
  });
}
