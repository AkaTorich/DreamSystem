// Добавить PDF. ПК: диалог Tauri → pdf_add {path, title}. Телефон: диалог отдаёт не путь,
// поэтому файл берётся выбором файла окна и уходит байтами — pdf_add_bytes {title, bytesB64}.
// Ядро кладёт том зашифрованным и само молча отправляет его на сайт, если есть вход.
import { bytesToB64 } from '../library/util.js';

const isPhone = () => /Android|iPhone|iPad/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPad с видом «Mac»

export async function addPdf(ctx) {
  try {
    return isPhone() ? await addFromPicker(ctx) : await addFromDialog(ctx);
  } catch (e) {
    ctx.ui.toast('PDF: ' + (e.message || e));
    return null;
  }
}

async function addFromDialog(ctx) {
  let path = await ctx.api.dialog().open({
    title: 'Добавить PDF', multiple: false, directory: false,
    filters: [{ name: 'PDF (*.pdf)', extensions: ['pdf'] }],
  });
  if (!path) return null;
  if (typeof path !== 'string') path = path.path;
  const title = String(path).split(/[\\/]/).pop().replace(/\.pdf$/i, '');
  const book = await ctx.api.invoke('pdf_add', { path, title });
  ctx.ui.toast('PDF на полке');
  return book;
}

function pickFile() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/pdf,.pdf';
    inp.style.display = 'none';
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    inp.addEventListener('cancel', () => { resolve(null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

async function addFromPicker(ctx) {
  const f = await pickFile();
  if (!f) return null;
  ctx.ui.toast('PDF кладётся на полку…');
  const bytes = new Uint8Array(await f.arrayBuffer());
  const book = await ctx.api.invoke('pdf_add_bytes', {
    title: f.name.replace(/\.pdf$/i, ''), bytesB64: bytesToB64(bytes),
  });
  ctx.ui.toast('PDF на полке');
  return book;
}
