// Перебор с возвратами: укладывает 36 звеньев так, чтобы соблюдались правила свёрток —
// приветствие духа в начале, блок зависшего сразу за ним, цель с результатом в хвосте.
import { DECK_SIZE, GREETING_LENGTH, canMerge } from './cards.js';

const BUDGET = 200000;   // потолок перебора: не найдя решения, пробуем новое тасование

// pool — свободные карты (без цели и зависшего), hung — зависшее в случайном порядке,
// target — цель с дописанным результатом, rules = {greeting, hung, result}, token = {cancelled}
// → массив из 36 карт или null
export function buildChain(pool, hung, target, rules, token) {
  const freeLength = DECK_SIZE - target.length;
  if (freeLength < 0) return null;

  const hungStart = rules.greeting ? GREETING_LENGTH : 0;
  const hungEnd = hungStart + hung.length;   // граница блока зависшего, не включая

  const slots = new Array(freeLength);
  const poolUsed = new Array(pool.length).fill(false);
  const hungUsed = new Array(hung.length).fill(false);
  let budget = BUDGET;

  function place(index) {
    if (token && token.cancelled) return false;
    if (budget-- <= 0) return false;

    if (index === freeLength)
      return freeLength === 0 || canMerge(slots[freeLength - 1], target[0]);

    const previous = index > 0 ? slots[index - 1] : null;
    const lastFree = index === freeLength - 1;
    const inHungBlock = rules.hung && hung.length > 0 && index >= hungStart && index < hungEnd;

    if (inHungBlock) {
      for (let i = 0; i < hung.length; i++) {
        if (hungUsed[i]) continue;
        const candidate = hung[i];
        if (previous && !canMerge(previous, candidate)) continue;
        if (lastFree && !canMerge(candidate, target[0])) continue;

        hungUsed[i] = true;
        slots[index] = candidate;
        if (place(index + 1)) return true;
        hungUsed[i] = false;
      }
      return false;
    }

    for (let i = 0; i < pool.length; i++) {
      if (poolUsed[i]) continue;
      const candidate = pool[i];
      // 1. приветствие духа — только мелкие быстрые события: перемещение, поглощение, общение
      if (rules.greeting && index < GREETING_LENGTH && candidate.rank > 8) continue;
      if (previous && !canMerge(previous, candidate)) continue;
      if (lastFree && !canMerge(candidate, target[0])) continue;

      poolUsed[i] = true;
      slots[index] = candidate;
      if (place(index + 1)) return true;
      poolUsed[i] = false;
    }
    return false;
  }

  if (!place(0)) return null;
  return slots.concat(target);
}
