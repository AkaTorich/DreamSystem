// Область «Гадания»: пять окон по шине oracle:open {name, dream?}.
// У каждого гадания своя папка: data/ (толкования), логика, window.js (export function open(ctx, opts)).
import { closeTop } from './common/frame.js';
import { resolveDream, dreamDay, dreamImage } from './common/dream.js';

const NAMES = ['medici', 'iching', 'obi', 'tonalpohualli', 'tzite'];

export async function init(ctx) {
  ctx.bus.on('oracle:open', async (p = {}) => {
    const name = p.name;
    if (!NAMES.includes(name)) { console.warn('нет гадания', name); return; }
    try {
      const dream = await resolveDream(ctx.api, p.dream);
      const mod = await import(`./${name}/window.js`);
      mod.open(ctx, { dream, day: dreamDay(dream), image: dreamImage(dream) });
    } catch (e) {
      console.error('гадание', name, e);
      ctx.ui.toast('Гадание не открылось: ' + (e.message || e));
    }
  });
  ctx.bus.on('ui:escape', () => closeTop());
}
