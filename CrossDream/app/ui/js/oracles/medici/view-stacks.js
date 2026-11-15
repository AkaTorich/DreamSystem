// Список карт («ЦЕЛЬ» или «ЗАВИСШЕЕ»): щелчок выделяет, двойной щелчок убирает выделенную.
import { h } from '../common/frame.js';
import { cardName } from './cards.js';
import { onDoubleTap } from './taps.js';

// onRemove(card) — убрать карту из стопки (вызывающий потом зовёт render)
export function buildStackPanel({ title, hint, onRemove }) {
  const list = h('div', { class: 'md-list', role: 'listbox' });
  let cards = [];
  let selected = null;

  function mark() {
    [...list.children].forEach((item, i) => item.classList.toggle('sel', cards[i] === selected));
  }

  function render(next) {
    cards = next;
    if (!cards.includes(selected)) selected = null;
    list.replaceChildren(...cards.map((card, i) =>
      h('div', { class: 'md-item' + (card === selected ? ' sel' : ''), role: 'option', 'data-i': i },
        cardName(card))));
  }

  list.addEventListener('click', e => {
    const item = e.target.closest('.md-item');
    if (!item) return;
    selected = cards[Number(item.dataset.i)] || null;
    mark();
  });

  // как в исходнике: двойной щелчок по списку убирает выделенную карту
  onDoubleTap(list, e => {
    const item = e.target.closest('.md-item');
    if (item) selected = cards[Number(item.dataset.i)] || selected;
    if (selected) onRemove(selected);
  });

  const el = h('div', { class: 'md-panel md-stack' },
    h('div', { class: 'md-head' }, title),
    h('div', { class: 'md-hint md-hint-small' }, hint),
    list);

  return { el, render };
}
