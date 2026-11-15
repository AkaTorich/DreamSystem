// Кнопка «Назад» на телефоне закрывает верхнее окно, а не программу.
// Android-оболочка Tauri по «Назад» листает историю страницы, пока есть куда, и только потом
// выходит. Поэтому каждому открытому окну или панели — своя запись в истории: «Назад» снимает
// запись и закрывает верхнее окно (как Esc), а из программы выходит, когда закрывать уже нечего.
// На компьютере то же делает боковая кнопка мыши «назад».

const shown = k => !k.hidden && getComputedStyle(k).display !== 'none';

// открытые окна и панели, верхнее — последним (окна всегда поверх панелей)
function openLayers() {
  const menu = document.getElementById('moreMenu');   // меню ☰ — тоже слой, самый верхний
  return [...document.querySelectorAll('#panels > .drawer.open'),
          ...[...document.getElementById('overlays').children].filter(shown),
          ...(menu && shown(menu) ? [menu] : [])];
}
const layers = () => openLayers().length;

// Esc и «Назад» закрывают ровно одно окно — верхнее, его же кнопкой закрытия
function closeTop() {
  const top = openLayers().pop();
  if (!top) return false;
  if (top.id === 'moreMenu') { top.hidden = true; return true; }
  const btns = [...top.querySelectorAll('button')].filter(shown);
  const btn = btns.find(b => b.title === 'Закрыть' || b.title === 'Закрыть окно')
    || btns.find(b => b.textContent.trim() === '✕')
    || btns.find(b => b.textContent.trim() === 'Закрыть');
  if (!btn) return false;
  btn.click();
  return true;
}

export function initBack() {
  let pushed = 0;      // наших записей в истории
  let skipping = 0;    // свои переходы назад (окно закрыли крестиком) — их popstate не трогаем

  const sync = () => {
    const n = layers();
    while (pushed < n) history.pushState({ cdLayer: ++pushed }, '');
    if (pushed > n) {  // окно закрыто не «Назадом» — убрать лишние записи
      const extra = pushed - n;
      pushed = n;
      skipping++;
      history.go(-extra);
    }
  };

  addEventListener('popstate', () => {
    if (skipping > 0) { skipping--; return; }
    pushed = Math.max(0, pushed - 1);
    closeTop();
    setTimeout(sync, 120);
  });

  // Esc — то же самое; раньше его ловила каждая область и закрывала каждая своё
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !closeTop()) return;   // окон нет — Esc идёт дальше (меню ☰ и т. п.)
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sync(); }); } };
  const watch = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] };
  new MutationObserver(later).observe(document.getElementById('overlays'), watch);
  new MutationObserver(later).observe(document.getElementById('panels'), watch);
  new MutationObserver(later).observe(document.getElementById('moreMenu'), { attributes: true, attributeFilter: ['hidden'] });
}
