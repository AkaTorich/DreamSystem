// Страницы PDF по мере прокрутки: под каждую страницу — пустое место нужного размера,
// рисуются только те, что рядом с видимой частью, ушедшие далеко — освобождаются (память телефона).
// Рисуется по одной странице за раз, ближайшая к текущей — первой.

const GAP = 14;

export function createPages(doc, box, { count, aspect, width }) {
  let W = width();
  const pages = [];
  const near = new Set();       // индексы страниц рядом с видимой частью
  let busy = false, dead = false, curTop = 0;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'pdf-page';
    const c = document.createElement('canvas');
    el.append(c);
    pages.push({ el, canvas: c, aspect, renderedW: 0 });
    box.append(el);
  }
  layout();

  function layout() {
    for (const p of pages) {
      p.el.style.width = W + 'px';
      p.el.style.height = Math.round(W * p.aspect) + 'px';
      p.el.style.marginBottom = GAP + 'px';
    }
  }

  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const i = +e.target.dataset.i;
      if (e.isIntersecting) near.add(i);
      else { near.delete(i); release(i); }
    }
    pump();
  }, { root: box, rootMargin: '150% 0px 150% 0px' });
  pages.forEach((p, i) => { p.el.dataset.i = i; io.observe(p.el); });

  function release(i) {
    const p = pages[i];
    if (!p.renderedW) return;
    p.canvas.width = 0; p.canvas.height = 0;
    p.renderedW = 0;
  }

  function wantW() {
    const dpr = window.devicePixelRatio || 1;
    return Math.max(600, Math.min(2400, Math.round(W * dpr * 1.1)));
  }

  async function pump() {
    if (busy || dead) return;
    busy = true;
    try {
      for (;;) {
        if (dead) break;
        const rw = wantW();
        let best = -1;
        for (const i of near) {
          if (pages[i].renderedW === rw) continue;
          if (best < 0 || Math.abs(i - curTop) < Math.abs(best - curTop)) best = i;
        }
        if (best < 0) break;
        await draw(best, rw);
      }
    } catch (e) { console.error('pdf страница', e); }
    finally { busy = false; }
  }

  async function draw(i, rw) {
    const p = pages[i];
    const page = await doc.getPage(i + 1);
    if (dead) return;
    const vp1 = page.getViewport({ scale: 1 });
    const a = vp1.height / vp1.width;
    if (Math.abs(a - p.aspect) > 0.002) {   // своя высота страницы — место подгоняется
      const before = p.el.offsetTop < box.scrollTop;
      const oldH = Math.round(W * p.aspect);
      p.aspect = a;
      p.el.style.height = Math.round(W * a) + 'px';
      if (before) box.scrollTop += Math.round(W * a) - oldH;   // не дёргать то, что читают
    }
    const vp = page.getViewport({ scale: rw / vp1.width });
    const off = document.createElement('canvas');
    off.width = Math.ceil(vp.width); off.height = Math.ceil(vp.height);
    await page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise;
    page.cleanup();
    if (dead || !near.has(i)) { p.renderedW = rw; release(i); return; }
    p.canvas.width = off.width; p.canvas.height = off.height;
    p.canvas.getContext('2d').drawImage(off, 0, 0);
    off.width = 0;
    p.renderedW = rw;
  }

  // какая страница сейчас вверху окна (с 1)
  function current() {
    const top = box.scrollTop + box.clientHeight * 0.35;
    let lo = 0, hi = pages.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pages[mid].el.offsetTop <= top) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    curTop = ans;
    return ans + 1;
  }

  return {
    count,
    current,
    scrollTo(n) {
      const p = pages[Math.max(0, Math.min(pages.length - 1, n - 1))];
      if (p) { box.scrollTop = p.el.offsetTop - 6; curTop = n - 1; }
    },
    // новая ширина (масштаб или размер окна): страница вверху остаётся на месте
    resize() {
      const keep = current();
      W = width();
      layout();
      this.scrollTo(keep);
      pump();
    },
    destroy() {
      dead = true;
      io.disconnect();
      pages.forEach((p, i) => release(i));
    },
  };
}
