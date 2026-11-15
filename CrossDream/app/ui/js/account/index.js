// Область «Аккаунт»: окно «⛅ Сайт» (btnSite) и «⚙ Настройки» (menuSettings).
// При запуске (после app:ready, когда все области уже слушают) спрашивает site_state
// и рассылает user:changed.
import { addCss } from '../dreams/util.js';
import { openSite, startup } from './site.js';
import { openSettings } from './settings.js';

export async function init(ctx) {
  addCss('css/account.css');
  ctx.ui.onTop('btnSite', () => openSite(ctx));
  ctx.ui.onTop('menuSettings', () => openSettings(ctx));
  ctx.bus.on('app:ready', () => startup(ctx));
  // тихий вход ядра может закончиться позже, чем интерфейс спросил о нём, — тогда спросить снова
  ctx.api.listen('site://login', () => startup(ctx)).catch(() => {});
}
