// Мелочи библиотеки: экранирование, склонение счёта, окна поверх, Esc только для верхнего окна.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// «3 книги», «5 томов», «1 вещь»
export function countWord(n, kind) {
  const w = kind === 'book' ? ['книга', 'книги', 'книг']
    : kind === 'pdf' ? ['том', 'тома', 'томов'] : ['вещь', 'вещи', 'вещей'];
  const m = n % 100, d = n % 10;
  return n + ' ' + (m > 10 && m < 15 ? w[2] : d === 1 ? w[0] : d > 1 && d < 5 ? w[1] : w[2]);
}

export function loadCss(href) {
  const url = String(href);
  if (document.querySelector(`link[data-css="${url}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = url; l.dataset.css = url;
  document.head.append(l);
}

// верхнее окно — последнее видимое в #overlays; поднять окно = переложить его в конец
export function topOverlay() {
  const kids = [...document.getElementById('overlays').children];
  for (let i = kids.length - 1; i >= 0; i--) {
    const k = kids[i];
    if (!k.hidden && getComputedStyle(k).display !== 'none') return k;
  }
  return null;
}

export function showOverlay(ov) {
  ov.classList.add('open');
  ov.hidden = false;
  document.getElementById('overlays').append(ov);
}

export function hideOverlay(ov) {
  ov.classList.remove('open');
}

export function isOpen(ov) {
  return !!ov && ov.classList.contains('open') && ov.isConnected;
}

// какое окно было верхним в миг нажатия Esc (до того, как другие области закроют своё)
let escTop = null;
window.addEventListener('keydown', e => { if (e.key === 'Escape') escTop = topOverlay(); }, true);
export function wasTopOnEsc(ov) { return !!ov && ov === escTop; }

// байты → base64 кусками (большие файлы не влезают в один String.fromCharCode)
export function bytesToB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function utf8ToB64(text) {
  return bytesToB64(new TextEncoder().encode(text));
}
