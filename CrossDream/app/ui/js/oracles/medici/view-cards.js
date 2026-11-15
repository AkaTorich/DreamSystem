// Панель «ВЫБОР КАРТ»: 36 маленьких вертикальных карт — масть в цвете, номинал в углу
// и большой знак в центре. Подсказка на карте — её смысл под текущее предназначение.
import { h } from '../common/frame.js';
import { rankLabel, suitSymbol, isRed } from './cards.js';
import { bindPress } from './taps.js';
import { L } from './data/labels.js';

function cardFace(card) {
  const suit = suitSymbol(card.suit);
  return h('div', { class: 'md-card' + (isRed(card) ? ' red' : ''), role: 'button' },
    h('div', { class: 'md-corner' },
      h('span', { class: 'md-r' }, rankLabel(card.rank)),
      h('span', { class: 'md-s' }, suit)),
    h('div', { class: 'md-pip' }, suit));
}

// onPrimary(card) — в цель (ЛКМ), onSecondary(card) — в зависшее (ПКМ)
export function buildCardsPanel({ deck, onPrimary, onSecondary }) {
  const faces = deck.map(card => {
    const face = cardFace(card);
    bindPress(face, { primary: () => onPrimary(card), secondary: () => onSecondary(card) });
    return face;
  });

  const el = h('div', { class: 'md-panel md-cards-panel' },
    h('div', { class: 'md-head' }, L.cardsHead),
    h('div', { class: 'md-hint' }, L.cardsHint),
    h('div', { class: 'md-cards-scroll' },
      h('div', { class: 'md-cards' }, faces)));

  return {
    el,
    // подсказки на картах показывают смысл под текущее предназначение
    refresh(describe) {
      faces.forEach((face, i) => { face.title = describe(deck[i]); });
    },
  };
}
