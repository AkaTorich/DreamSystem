// Одна карта на экране — два режима: своя карта снов и «чужая» (космос сновидцев,
// карта сновидца — их строит область admin). Здесь же пустая заставка и показ сна на карте.
import { $, el } from '../shell/ui.js';
import { SphereMap } from './engine/sphere.js';
import { linkColor, sphereColors } from './palette.js';
import { buildOwn, ownHandlers } from './own.js';
import { state, getSettings } from '../dreams/store.js';
import { showLegend, showBridgeNote } from './legend.js';

let engine = null, own = null, cur = null, mode = 'own', dirty = false, ownView = null;

export const getEngine = () => engine;
export const getMode = () => mode;

export function createMap(ctx) {
  // обработчики берутся у текущего режима: своя карта или чужая
  const call = name => (...a) => cur && cur[name] && cur[name](...a);
  engine = new SphereMap($('map'), {
    colors: sphereColors, linkColor,
    onSelect: call('onSelect'), onMove: call('onMove'), onAlign: call('onAlign'),
    onView: v => { if (mode === 'own') { ownView = v; call('onView')(v); } },
  });
  own = ownHandlers(ctx, () => rebuildOwn());
  cur = own;
  makeEmpty();
  getSettings().then(s => {
    if (s && s.MapZoom > 0) {
      ownView = { zoom: s.MapZoom, panx: s.MapPanX || 0, pany: s.MapPanY || 0 };
      if (mode === 'own') { engine.setView(ownView); if (!engine.anyVisible()) engine.fitAll(); }
    }
  }).catch(() => {});
  return engine;
}

function makeEmpty() {
  if ($('empty')) return;
  const box = el('div', { id: 'empty', hidden: true },
    el('div', { class: 'big' }, 'Здесь родится карта ваших снов'),
    el('div', { class: 'sub' }, window.__CD_WEB__
      ? 'Войдите на вкладке «Сайт» — и здесь появится ваша карта снов. Или запишите первый сон.'
      : 'Запишите первый сон — или перенесите базу из прежней программы (кнопка «⋯» в шапке → «Импорт снов»).'),
    el('button', { class: 'primary', onclick: () => $('btnNew').click() }, 'Записать первый сон'));
  document.body.append(box);
}

// своя карта: перестроить из памяти сонника (в чужом режиме — отложить до возврата)
export function rebuildOwn() {
  if (mode !== 'own') { dirty = true; return; }
  dirty = false;
  const has = state.dreams.length > 0;
  $('empty').hidden = has;
  showLegend(has);
  showBridgeNote(false);
  const { nodes, edges } = buildOwn();
  const first = !engine.nodes.length;
  engine.setData(nodes, edges, 1);
  // при запуске: положение карты с другого экрана (сайт, другое устройство) может увести все сны
  // за край — тогда один раз вписать их. Дальше карту двигаете только вы.
  if (first && has) { if (ownView) engine.setView(ownView); if (!engine.anyVisible()) engine.fitAll(); }
}

// чужая карта: {nodes, edges, clusters, handlers:{onSelect,onMove,onAlign}, bridges}
export function showForeign({ nodes, edges, clusters = 1, handlers = {}, bridges = false, view = null }) {
  mode = 'foreign';
  cur = handlers;
  $('empty').hidden = true;
  showLegend(true);
  showBridgeNote(bridges);
  engine.setData(nodes, edges, clusters);
  if (view) engine.setView(view); else engine.setView({ zoom: 1, panx: 0, pany: 0 });
}

export function showOwn() {
  if (mode === 'own') return;
  mode = 'own';
  cur = own;
  rebuildOwn();
  engine.setView(ownView || { zoom: 1, panx: 0, pany: 0 });
  dirty = false;
}

// показать сон посреди своей карты
export function focusDream(id) {
  if (mode !== 'own') showOwn();
  else if (dirty) rebuildOwn();
  engine.focusNode(id);
}
