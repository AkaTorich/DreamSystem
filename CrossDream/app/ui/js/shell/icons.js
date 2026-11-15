// Контурные значки шапки и полок — свои SVG: одинаковы на всех системах, не зависят от шрифтов.
// icon('map') → <svg>; fillIcons() ставит значок в каждый элемент с data-icon.

const P = {
  map: '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2"/><circle cx="8" cy="9.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="14" r="1.3" fill="currentColor"/>',
  dreams: '<path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.8A6 6 0 0 1 15.5 4.5z"/><path d="M18 4v3M16.5 5.5h3"/>',
  library: '<path d="M5 4.5h4v15H5zM10 4.5h4v15h-4z"/><path d="M15.2 5.4l3.7-1 3.1 14.3-3.7 1z"/>',
  cosmos: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15.5 14.2c2.6-.2 4.5 1.3 5 4.3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6"/>',
  site: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 18.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
  gift: '<path d="M4 9.5h16v3H4zM5.5 12.5h13v7h-13zM12 9.5v10"/><path d="M12 9.5c-1.5-3.5-5-3.5-5-1.5S10 9.5 12 9.5c2 0 5 .5 5-1.5s-3.5-2-5 1.5z"/>',
  trust: '<path d="M3 12l3.5-3.5L10 10l2-1.5 2 1.5 3.5-1.5L21 12"/><path d="M6.5 8.5L12 15l3-2.5M10 12.5l2.5 2.5M8 11l3 3.5"/>',
  folder: '<path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4l1.8 2H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
  folderPlus: '<path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h4l1.8 2H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M12 10.5v5M9.5 13h5"/>',
  back: '<path d="M14.5 6l-6 6 6 6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  book: '<path d="M6 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v13.5H7.5A1.5 1.5 0 0 1 6 18z"/><path d="M6 18a1.5 1.5 0 0 1 1.5-1.5H18"/>',
  pdf: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/><path d="M9.5 13h6M9.5 16h4.5"/>',
  tool: '<path d="M14.5 5.5a4 4 0 0 0-5 5L4.5 15.5l4 4 5-5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
};

const NS = 'http://www.w3.org/2000/svg';

export function icon(name, size = 18) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.6'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('class', 'svgi'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || '';
  return s;
}

export function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(e => {
    if (e.querySelector(':scope > svg.svgi')) return;
    e.prepend(icon(e.dataset.icon, +e.dataset.size || 18));
  });
}
