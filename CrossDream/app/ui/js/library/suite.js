// Полка сюиты «Гермес»: продукты с сайта, значки (один раз скачиваются и живут в кеше ядра),
// скачивание по щелчку командой suite_download.
import { S, errText } from './state.js';
import { itemCard } from './shelves.js';
import { shelvesEl } from './shell.js';
import { icon as svgIcon } from '../shell/icons.js';

const toolIcon = s => svgIcon('tool', s);   // у программы нет своего значка

const icons = new Map();   // id → адрес картинки
let loading = false;

export function suiteCard(f) {
  const { el } = S.ctx.ui;
  const id = +f.id;
  const src = icons.get(id);
  const icon = el('div', { class: 'bicon lib-suite-icon' },
    src ? el('img', { src, alt: '' }) : toolIcon(28));
  const card = itemCard('lib-suite', 'file:' + id, () => downloadSuite(f),
    icon,
    el('div', { class: 'btitle' }, f.title || ''),
    el('div', { class: 'bsub' }, sizeText(+f.size || 0)));
  if (f.descr) card.title = f.descr;
  return card;
}

export async function loadSuiteIcons() {
  if (loading || !S.files || !S.online) return;
  loading = true;
  try {
    for (const f of S.files) {
      const id = +f.id;
      if (icons.has(id) || !f.icon) continue;
      try {
        const path = await S.ctx.api.invoke('site_download', { rel: 'api.php?action=file_icon&id=' + id });
        if (!path) continue;
        const src = S.ctx.api.fileSrc(path);
        icons.set(id, src);
        // значок встаёт на свою карточку без перерисовки полки
        const box = shelvesEl();
        const card = box && [...box.querySelectorAll('.bookcard')].find(c => c.dataset.key === 'file:' + id);
        const slot = card && card.querySelector('.lib-suite-icon');
        if (slot) { slot.textContent = ''; slot.append(Object.assign(document.createElement('img'), { src, alt: '' })); }
      } catch { /* без значка — шестерёнка */ }
    }
  } finally { loading = false; }
}

// настоящее имя файла лежит в скобках названия: «Анкх (Ankh.exe)» → Ankh.exe
export function fileNameOf(title) {
  const m = /\(([^()]+\.[A-Za-z0-9]{1,5})\)\s*$/.exec(title || '');
  return m ? m[1] : (title || 'file');
}

// щелчок по программе: на компьютере — скачать один раз, ярлык на рабочий стол и запуск (suite_open);
// на сайте — просто скачать браузером
export async function downloadSuite(f) {
  const title = f.title || '';
  const toast = S.ctx.ui.toast;
  try {
    if (window.__CD_WEB__) {
      toast('«' + title + '» скачивается…');
      await S.ctx.api.invoke('suite_download', { id: +f.id, fileName: fileNameOf(title) });
      return;
    }
    toast('«' + title + '» — открываю…');
    const r = await S.ctx.api.invoke('suite_open', { id: +f.id, fileName: fileNameOf(title), title, size: +f.size || null });
    if (r.launched) toast('«' + title + '» запущен' + (r.downloaded && r.shortcut ? ' — ярлык на рабочем столе' : ''));
    else toast('«' + title + '» сохранён: ' + r.path + ' (это программа для Windows)');
  } catch (e) { toast('Сюита: ' + errText(e)); }
}

// размер по-человечески: маленькие программы — в килобайтах, а не «0.0 МБ»
function sizeText(b) {
  return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
}
