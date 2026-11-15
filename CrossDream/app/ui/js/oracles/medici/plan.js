// Подготовка перебора: цель должна быть свёрнута, результат (правило 3) дописывается
// в хвост цели, и всё вместе должно уложиться в 36 звеньев.
// Цепочка из 36 звеньев складывается так:
//   [приветствие духа: 3] [проработка зависшего: k] [тело] [цель + результат]
import { DECK_SIZE, GREETING_LENGTH, canMerge, cardName, same } from './cards.js';
import { MSG } from './data/messages.js';

// rules = {greeting, hung, result}
// → {target, hung, addedResult} или {error: сообщение}
export function preparePlan(deck, finalStack, hungStack, rules) {
  const target = finalStack.slice();
  const hung = rules.hung ? hungStack.slice() : [];

  // соседние звенья цели обязаны сцепляться между собой
  for (let i = 1; i < target.length; i++) {
    if (!canMerge(target[i - 1], target[i]))
      return { error: MSG.targetBroken(cardName(target[i - 1]), cardName(target[i])) };
  }

  // 3. результат — замыкающее звено цели
  let addedResult = null;
  if (rules.result && target[target.length - 1].rank !== 10) {
    const last = target[target.length - 1];
    addedResult = deck.find(c => c.rank === 10
      && canMerge(last, c)
      && !target.some(t => same(t, c))
      && !hung.some(h => same(h, c))) || null;
    if (!addedResult) return { error: MSG.noResult };
    target.push(addedResult);
  }

  const greeting = rules.greeting ? GREETING_LENGTH : 0;
  const reserved = target.length + hung.length + greeting;
  if (reserved > DECK_SIZE)
    return { error: MSG.noRoom(target.length, hung.length, greeting) };

  return { target, hung, addedResult };
}
