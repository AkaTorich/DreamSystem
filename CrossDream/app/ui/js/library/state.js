// Общее состояние библиотеки (одно на все её модули).
export const S = {
  ctx: null,              // {api, ui, status, bus}
  mode: 'book',           // вкладка: 'book' — иероглифы, 'pdf', 'file' — сюита
  books: null,            // книги иероглифов (books.json мода или книги с сайта)
  booksPath: null,        // путь books.json (только Windows с модом)
  pdfs: null,             // [PdfBook] — свои PDF на устройстве
  files: null,            // файлы сюиты (с сайта)
  folders: [],            // папки всех родов: {id, name, kind}
  bookFolder: new Map(),  // num книги → id папки
  pdfFolder: new Map(),   // Id PDF (ext_id) → id папки
  bookSiteId: new Map(),  // num книги → id на сайте
  pdfSiteId: new Map(),   // Id PDF → id на сайте
  indexJson: null,        // раскладка, по которой полка нарисована сейчас
  curFolder: null,        // открытая папка (null — общая полка)
  picking: false,
  picked: new Set(),      // ключи 'book:num' | 'pdf:Id' | 'file:id'
  online: false,          // вошли на сайт
  user: null,
  link: null,             // режим связывания: {type, siteId, title}
  clip: null,             // буфер: {op: 'copy'|'cut', kind, keys} — вставляется в открытую папку
  selfSaveAt: 0,          // когда библиотека сама сохранила книги (чтобы не перечитывать своё же)
};

export function errText(e) {
  return (e && (e.message || e.error)) || String(e);
}

// склонение вкладки → род папок сайта
export const KIND = { book: 'book', pdf: 'pdf', file: 'file' };
