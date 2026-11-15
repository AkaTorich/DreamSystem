// Прежний (жадный) расчёт: карта за картой пристраивается к голове цепочки, пока не
// кончится колода. Правила свёрток здесь не действуют — это отдельный инструмент.
import { canMerge } from './cards.js';

// remaining — колода без карт цели (перетасованная), finalStack — цель
// → цепочка из всех карт или null, если очередная карта не нашлась
export function buildChainGreedy(remaining, finalStack) {
  const chain = finalStack.slice();
  const deck = remaining.slice();

  while (deck.length > 0) {
    const idx = deck.findIndex(card => canMerge(card, chain[0]));
    if (idx < 0) return null;

    chain.unshift(deck[idx]);
    deck.splice(idx, 1);
  }

  return chain;
}
