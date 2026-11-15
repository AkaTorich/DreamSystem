// Колода Медичи: 36 карт (6…Т, четыре масти), имя карты и правило сцепки звеньев.
// Карта — {rank, suit}: rank 6..14 (6–10, В — 11, Д — 12, К — 13, Т — 14), suit 'ч','б','п','к'.

export const DECK_SIZE = 36;
export const GREETING_LENGTH = 3;

const SUITS = ['ч', 'б', 'п', 'к'];

export function makeDeck() {
  const deck = [];
  for (let rank = 6; rank <= 14; rank++)
    for (const suit of SUITS) deck.push({ rank, suit });
  return deck;
}

// подпись достоинства на карте: 6…10, В, Д, К, Т
export function rankLabel(rank) {
  switch (rank) {
    case 11: return 'В';
    case 12: return 'Д';
    case 13: return 'К';
    case 14: return 'Т';
    default: return String(rank);
  }
}

// имя карты в логе и списках: «6ч», «10к», «Вп»
export function cardName(card) {
  const rank = card.rank >= 6 && card.rank <= 14 ? rankLabel(card.rank) : '?';
  return rank + card.suit;
}

export function suitSymbol(suit) {
  switch (suit) {
    case 'ч': return '♥';
    case 'б': return '♦';
    case 'п': return '♠';
    default: return '♣';   // крести
  }
}

export function isRed(card) {
  return card.suit === 'ч' || card.suit === 'б';
}

export function same(a, b) {
  return a != null && b != null && a.rank === b.rank && a.suit === b.suit;
}

// звенья сцепляются, если у них общая масть или общее достоинство
export function canMerge(a, b) {
  return a.suit === b.suit || a.rank === b.rank;
}

// карта-персона: Валет, Дама или Король
export function isPerson(card) {
  return card.rank >= 11 && card.rank <= 13;
}
