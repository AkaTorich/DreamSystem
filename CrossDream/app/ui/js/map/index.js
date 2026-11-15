// Область «Карта»: небо, сфера снов, легенда с глазом нитей, чёрная дыра в углу.
// Слушает: dreams:reload и dreams://changed (через store), map:focus, user:changed.
import { $, el } from '../shell/ui.js';
import { addCss } from '../dreams/util.js';
import * as store from '../dreams/store.js';
import { startSky, redrawSky } from './sky.js';
import { createMap, rebuildOwn, focusDream } from './view.js';
import { initLegend } from './legend.js';
import { fromUser, onPalette } from './palette.js';

// чёрная дыра — не кнопка, а место: сюда падают скормленные дары (крутится только тогда)
function blackHole() {
  if ($('blackHole')) return;
  document.body.append(el('div', { id: 'blackHole', title: 'Чёрная дыра: сюда падают скормленные дары' },
    el('div', { class: 'bh-ring' }), el('div', { class: 'bh-core' })));
}

export async function init(ctx) {
  addCss('css/map.css');
  startSky($('sky'));
  const engine = createMap(ctx);
  blackHole();
  await initLegend(engine);

  store.onChange(() => rebuildOwn());
  store.init(ctx);

  onPalette(() => engine.redraw());
  ctx.bus.on('user:changed', u => fromUser(u));
  ctx.bus.on('map:focus', id => focusDream(id));
  ctx.bus.on('map:shown', () => engine.redraw());   // закрылась страница — карта снова на виду
  ctx.bus.on('theme:changed', () => { redrawSky(); engine.redraw(); });   // другая расцветка
}
