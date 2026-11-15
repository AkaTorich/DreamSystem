// Диалоги плагина dialog на HTML. В браузере путей нет — `open` отдаёт строку-указатель
// «cdfile:<n>/<имя файла>» (имя в конце: интерфейс берёт из «пути» название книги), по которой
// команды (pdf_add, read_text_file) и convertFileSrc находят сам выбранный File.
// `save` отдаёт «cdsave:<n>/<имя>»: save_text_file по нему скачивает текст под этим именем.

const files = new Map();   // n → File
const urls = new Map();    // n → blob:-адрес
let seq = 0;

const FILE = /^cdfile:(\d+)\//;
const SAVE = /^cdsave:\d+\/(.*)$/;

export const isFileToken = p => FILE.test(String(p ?? ''));
export const isSaveToken = p => SAVE.test(String(p ?? ''));

// File по указателю; нет такого — null
export function fileOf(token) {
  const m = FILE.exec(String(token ?? ''));
  return m ? files.get(+m[1]) || null : null;
}

// имя файла по указателю сохранения
export function saveName(token) {
  const m = SAVE.exec(String(token ?? ''));
  return m ? m[1] : '';
}

// адрес для fetch/<img> по указателю выбранного файла
export function fileUrl(token) {
  const m = FILE.exec(String(token ?? ''));
  if (!m) return '';
  const n = +m[1];
  if (!urls.has(n) && files.has(n)) urls.set(n, URL.createObjectURL(files.get(n)));
  return urls.get(n) || '';
}

function remember(f) {
  const n = ++seq;
  files.set(n, f);
  return 'cdfile:' + n + '/' + f.name;
}

// фильтры Tauri [{name, extensions:['pdf']}] → accept для <input type=file>
function accept(filters) {
  const exts = (filters || []).flatMap(f => f.extensions || []);
  if (!exts.length || exts.includes('*')) return '';
  const mime = { pdf: 'application/pdf', json: 'application/json', txt: 'text/plain' };
  return exts.flatMap(e => ['.' + e, mime[e]].filter(Boolean)).join(',');
}

// выбор файла: строка-указатель (или массив при multiple); отказались — null
export function open(opts = {}) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.style.display = 'none';
    const a = accept(opts.filters);
    if (a) inp.accept = a;
    if (opts.multiple) inp.multiple = true;
    if (opts.directory) inp.webkitdirectory = true;
    let settled = false;
    const finish = v => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      inp.remove();
      resolve(v);
    };
    const pick = () => {
      const list = [...(inp.files || [])];
      if (!list.length) return finish(null);
      const tokens = list.map(remember);
      finish(opts.multiple ? tokens : tokens[0]);
    };
    inp.addEventListener('change', pick);
    inp.addEventListener('cancel', () => finish(null));
    // старые браузеры не шлют «cancel»: окно вернуло фокус, а файла так и нет — отказались
    const onFocus = () => setTimeout(() => { if (!inp.files || !inp.files.length) finish(null); }, 1500);
    setTimeout(() => window.addEventListener('focus', onFocus), 300);
    document.body.append(inp);
    inp.click();
  });
}

// «сохранить как»: диалога у браузера нет — файл скачается под предложенным именем
export function save(opts = {}) {
  const name = String(opts.defaultPath || 'file.txt').split(/[\\/]/).pop() || 'file.txt';
  return Promise.resolve('cdsave:' + (++seq) + '/' + name);
}

const titled = (msg, opts) => {
  const t = typeof opts === 'string' ? opts : opts && opts.title;
  return t ? t + '\n\n' + msg : String(msg);
};

export const ask = (msg, opts) => Promise.resolve(window.confirm(titled(msg, opts)));
export const confirm = ask;
export function message(msg, opts) { window.alert(titled(msg, opts)); return Promise.resolve(); }

// скачать Blob под именем (save_text_file, suite_download)
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadUrl(url, name) {
  const a = document.createElement('a');
  a.href = url;
  if (name) a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
}
