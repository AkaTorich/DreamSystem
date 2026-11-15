// Область «Управление»: пользователи и инвайты (menuUsers), ларец даров (btnGifts, бейдж),
// доверие (btnTrust), космос сновидцев (menuCosmos). Всё — через api.site().
import { addCss } from '../dreams/util.js';
import { addEscape } from '../dreams/modal.js';
import { openUsers } from './users.js';
import { openGifts, refreshBadge, clearBadge } from './gifts.js';
import { openTrust } from './trust.js';
import { openCosmos, closeCosmos } from './cosmos.js';
import { linking, cancelLink, foreignCardOpen, closeForeignCard } from './cosmos-card.js';

export async function init(ctx) {
  addCss('css/admin.css');
  ctx.ui.onTop('menuUsers', () => openUsers(ctx));
  ctx.ui.onTop('btnGifts', () => openGifts(ctx));
  ctx.ui.onTop('btnTrust', () => openTrust(ctx));
  ctx.ui.onTop('menuCosmos', () => openCosmos(ctx));

  ctx.bus.on('user:changed', async u => {
    if (!u) { clearBadge(); cancelLink(); closeCosmos(); return; }
    const r = await refreshBadge();
    if (r && r.count) ctx.ui.toast('В вашем ларце даров: ' + r.count + ' — кнопка «Ларец даров» в шапке');
  });
  // свой сон из списка или с карты — значит, пора на свою карту
  ctx.bus.on('map:focus', () => closeCosmos());
  ctx.bus.on('cosmos:close', () => closeCosmos());   // вкладка «Карта»

  addEscape(() => {
    if (foreignCardOpen()) { closeForeignCard(); return true; }
    if (linking()) { cancelLink(); return true; }
    return false;
  });
}
