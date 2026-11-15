// Вкладки библиотеки и кнопки шапки: смена вкладки, «➕» (книга или PDF), выбор другого books.json.
import { S, errText } from './state.js';
import { loadBooks, loadPdfs, loadSuite } from './data.js';
import { render } from './shell.js';
import { openBookForm } from './bookform.js';
import { addPdf } from '../pdf/add.js';
import { loadSuiteIcons } from './suite.js';

export async function setMode(mode) {
  S.mode = mode;
  S.curFolder = null; S.picking = false; S.picked.clear();
  if (mode === 'pdf' && !S.pdfs) { try { await loadPdfs(); } catch (e) { S.pdfs = []; S.ctx.ui.toast('PDF: ' + errText(e)); } }
  render();
  if (mode === 'file') {
    if (!S.files) { await loadSuite(); render(); }
    loadSuiteIcons();
  }
}

export async function newItem() {
  if (S.mode === 'pdf') {
    const p = await addPdf(S.ctx);
    if (p) { await loadPdfs(); render(); }
    return;
  }
  if (S.mode === 'book') openBookForm(null);
}

// другой books.json мода (Windows): путь запоминается в настройках ядра
export async function browseBooks() {
  const { api, ui } = S.ctx;
  try {
    const path = await api.dialog().open({
      title: 'books.json из папки мода «Египетские иероглифы»',
      multiple: false, directory: false,
      filters: [{ name: 'Книги мода (books.json)', extensions: ['json'] }],
    });
    if (!path) return;
    const st = await api.invoke('settings_get');
    st.BooksPath = typeof path === 'string' ? path : path.path;
    await api.invoke('settings_set', { settings: st });
    await loadBooks();
    S.curFolder = null; S.picking = false; S.picked.clear();
    render();
  } catch (e) { ui.toast('Не удалось прочитать книги: ' + errText(e)); }
}
