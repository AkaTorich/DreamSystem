// Смысл карты под текущее предназначение. Жадный алгоритм и «свободный» — исходное
// толкование первого алгоритма; остальные режимы — стадия · сфера + пояснение режима.
import { CARD_DESCRIPTIONS } from './data/cards.js';
import { RANK_STAGE, SUIT_SPHERE, CLAUSES } from './data/clauses.js';
import { cardName } from './cards.js';

// state = {mode: 'goal'|'reutov'|'hung'|'person'|'day'|'free', greedy: bool}
export function describeCard(card, state) {
  const original = state.greedy || state.mode === 'free';
  if (original) {
    const key = cardName(card);
    return Object.prototype.hasOwnProperty.call(CARD_DESCRIPTIONS, key) ? CARD_DESCRIPTIONS[key] : key;
  }
  return composedMeaning(card, state.mode);
}

// смысл карты через призму выбранного предназначения (на документированной
// системе стадий и сфер; исходные толкования при этом остаются нетронуты)
export function composedMeaning(card, mode) {
  const stage = RANK_STAGE[card.rank] || RANK_STAGE[14];
  const sphere = SUIT_SPHERE[card.suit] || SUIT_SPHERE['к'];
  const table = CLAUSES[mode] || CLAUSES.day;
  const clause = table[card.rank] || table[14];
  return stage + ' · ' + sphere + '. ' + clause;
}
