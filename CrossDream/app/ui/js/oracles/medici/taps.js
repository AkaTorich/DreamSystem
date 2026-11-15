// Мышь и касание одинаково: щелчок — левая кнопка, долгое касание — правая кнопка,
// двойное касание — двойной щелчок.

const LONG_MS = 550;
const MOVE_PX = 10;
const DOUBLE_MS = 350;

// primary — щелчок / касание; secondary — правый щелчок / долгое касание
export function bindPress(el, { primary, secondary }) {
  let timer = null;
  let longFired = false;   // долгое касание сработало — следующий щелчок не считать
  let touching = false;
  let sx = 0, sy = 0;

  const cancel = () => { clearTimeout(timer); timer = null; };

  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    touching = true; longFired = false;
    sx = e.clientX; sy = e.clientY;
    cancel();
    timer = setTimeout(() => { timer = null; longFired = true; secondary(e); }, LONG_MS);
  });
  el.addEventListener('pointermove', e => {
    if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > MOVE_PX) cancel();
  });
  const end = () => { cancel(); setTimeout(() => { touching = false; }, 0); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // правая кнопка мыши; у касания меню глушится — его заменяет долгое касание
  el.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (touching || longFired) return;
    secondary(e);
  });
  el.addEventListener('click', e => {
    if (longFired) { longFired = false; return; }
    primary(e);
  });
}

// двойной щелчок мышью или двойное касание
export function onDoubleTap(el, fn) {
  let lastTap = 0;
  let lastTouchFire = 0;
  el.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse') return;
    const now = Date.now();
    if (now - lastTap < DOUBLE_MS) {
      lastTap = 0; lastTouchFire = now;
      fn(e);
    } else {
      lastTap = now;
    }
  });
  el.addEventListener('dblclick', e => {
    if (Date.now() - lastTouchFire < 700) return;   // уже сработало от касания
    fn(e);
  });
}
