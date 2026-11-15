// pdf.js (vendor/pdfjs, сборка 3.11 без модулей) подключается один раз, по первому требованию.
let loading = null;

const base = new URL('../../vendor/pdfjs/', import.meta.url);

export function getPdfjs() {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const ready = () => {
      const lib = window.pdfjsLib;
      if (!lib) { reject(new Error('pdf.js не загрузился')); return; }
      lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', base).href;
      resolve(lib);
    };
    if (window.pdfjsLib) { ready(); return; }
    const s = document.createElement('script');
    s.src = new URL('pdf.min.js', base).href;
    s.onload = ready;
    s.onerror = () => { loading = null; reject(new Error('pdf.js не загрузился')); };
    document.head.append(s);
  });
  return loading;
}
