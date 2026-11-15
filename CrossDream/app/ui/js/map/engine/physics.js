// Один шаг раскладки: узлы отталкиваются, нити стягивают, стенка сферы держит.
// Закреплённые (авторские позиции, планеты, орбиты) физика не трогает.
export function stepOnce(m) {
  const nodes = m.nodes;
  if (!nodes.length) return;
  // радиус сферы растёт с числом узлов — равномерная плотность, без разлёта по космосу
  const perCluster = nodes.length / (m.centers ? m.centers.length : 1);
  const R = Math.min(230, 70 + 42 * Math.cbrt(perCluster));
  for (const a of nodes) {
    if (a === m.dragNode || a.pinned) continue;
    let fx = (a.cx - a.x) * .003, fy = (a.cy - a.y) * .003, fz = (a.cz - a.z) * .003;
    for (const b of nodes) {
      if (a === b) continue;
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz + 60;
      if (d2 > 490000) continue;   // дальше 700 — отталкивание ничтожно
      const f = 14000 / d2, d = Math.sqrt(d2);
      fx += dx / d * f; fy += dy / d * f; fz += dz / d * f;
    }
    const rx = a.x - a.cx, ry = a.y - a.cy, rz = a.z - a.cz;
    const dist = Math.sqrt(rx * rx + ry * ry + rz * rz) + .01;
    if (dist > R) {
      const f = (dist - R) * .012;   // жёсткая стенка сферы
      fx -= rx / dist * f; fy -= ry / dist * f; fz -= rz / dist * f;
    }
    a.vx = (a.vx + fx) * .8; a.vy = (a.vy + fy) * .8; a.vz = (a.vz + fz) * .8;
    const sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy + a.vz * a.vz);
    if (sp > 6) { a.vx *= 6 / sp; a.vy *= 6 / sp; a.vz *= 6 / sp; }
  }
  for (const l of m.links) {
    const dx = l.nb.x - l.na.x, dy = l.nb.y - l.na.y, dz = l.nb.z - l.na.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + .01;
    const f = (d - (l.cross ? 420 : 170)) * .004;
    const ux = dx / d, uy = dy / d, uz = dz / d;
    if (l.na !== m.dragNode && !l.na.pinned) { l.na.vx += ux * f * 8; l.na.vy += uy * f * 8; l.na.vz += uz * f * 8; }
    if (l.nb !== m.dragNode && !l.nb.pinned) { l.nb.vx -= ux * f * 8; l.nb.vy -= uy * f * 8; l.nb.vz -= uz * f * 8; }
  }
  for (const a of nodes)
    if (a !== m.dragNode && !a.pinned) { a.x += a.vx; a.y += a.vy; a.z += a.vz; }
}
