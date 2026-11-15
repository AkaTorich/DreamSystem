// Точка входа. Каждая область — своя папка со своим index.js (export async function init(ctx)).
// Области подключаются по отдельности: ошибка в одной не роняет остальные.
import * as api from './shell/api.js';
import * as ui from './shell/ui.js';
import * as status from './shell/status.js';
import { initBack } from './shell/back.js';
import { initTabs } from './shell/tabs.js';
import { fillIcons } from './shell/icons.js';
import { initTheme } from './shell/themes.js';

const AREAS = ['map', 'dreams', 'account', 'admin', 'library', 'pdf', 'oracles'];

async function start() {
  if (window.__CD_WEB__) document.body.classList.add('cd-gate');   // сайт: пока не ясно, вошли ли, — только форма входа
  initTheme(ui.bus);   // расцветка — раньше всего, чтобы окно не мигало
  fillIcons();
  if (window.__CD_WEB__) {   // сайт: импорта старой базы нет, а в меню «⋯» больше ничего
    document.getElementById('menuImport').hidden = true;
    document.getElementById('btnMore').hidden = true;
  }
  ui.initMenu();
  status.initStatus();
  initBack();   // «Назад» на телефоне закрывает верхнее окно
  const ctx = { api, ui, status, bus: ui.bus };
  for (const name of AREAS) {
    try {
      const mod = await import(`./${name}/index.js`);
      await mod.init?.(ctx);
    } catch (e) {
      console.error('область', name, e);
    }
  }
  initTabs(ui.bus);   // после областей: их кнопки уже подписаны
  ui.bus.emit('app:ready');
}

start();
