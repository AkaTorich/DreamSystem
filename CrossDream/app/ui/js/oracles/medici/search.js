// Поиск цепочки: попытка за попыткой (новое тасование каждый раз), пока не найдена или не
// нажат «Стоп». Окно не замирает: каждые ~30 мс поиск уступает ход отрисовке.
import { DECK_SIZE, same } from './cards.js';
import { randomOrder, shuffleMultiple } from './shuffle.js';
import { buildChain } from './backtrack.js';
import { buildChainGreedy } from './greedy.js';

const SLICE_MS = 30;

export function newToken() {
  return { cancelled: false };
}

// attempt() → Promise<цепочка|null>; onAttempt() — после каждой попытки (счётчик)
export async function runSearch(token, attempt, onAttempt) {
  let sliceStart = performance.now();
  while (!token.cancelled) {
    const chain = await attempt();
    if (token.cancelled) return null;
    onAttempt();
    if (chain) return chain;
    if (performance.now() - sliceStart > SLICE_MS) {
      await new Promise(r => setTimeout(r));
      sliceStart = performance.now();
    }
  }
  return null;
}

// попытка перебора с возвратами по подготовленному плану (plan.js)
export function backtrackAttempt(deck, plan, rules, shuffleTimes, token) {
  return async () => {
    const pool = randomOrder(deck.filter(c =>
      !plan.target.some(t => same(t, c)) && !plan.hung.some(h => same(h, c))));
    await shuffleMultiple(pool, shuffleTimes, token);

    const hungOrder = randomOrder(plan.hung);
    const chain = buildChain(pool, hungOrder, plan.target, rules, token);
    return chain && chain.length === DECK_SIZE ? chain : null;
  };
}

// попытка жадного расчёта: вся колода без карт цели, наугад
export function greedyAttempt(deck, finalStack, shuffleTimes, token) {
  return async () => {
    const shuffled = randomOrder(deck);
    await shuffleMultiple(shuffled, shuffleTimes, token);

    const remaining = shuffled.filter(c => !finalStack.some(f => same(f, c)));
    const chain = buildChainGreedy(remaining, finalStack);
    return chain && chain.length === DECK_SIZE ? chain : null;
  };
}
