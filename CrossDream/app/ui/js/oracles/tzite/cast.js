// Горсть красных семян цитэ, разложенная ПО ЧЕТЫРЕ: число кучек уводит счёт вперёд
// по цолькину, остаток говорит, каков ответ. Так гадали Шпийакок и Шмукане в «Пополь-Вух».
import { jdn, tzolkin } from './tzolkin.js';

// горсть: сколько семян легло в ладонь — от 28 до 72 (как Random.Next(28, 73))
export function throwHand() {
  return 28 + Math.floor(Math.random() * 45);
}

// бросок для дня сна {y, m, d}: горсть, кучки, остаток, день сна и день-ответ
export function cast(day, hand = throwHand()) {
  const piles = Math.floor(hand / 4);     // раскладка по четыре
  const rest = hand % 4;
  const start = tzolkin(jdn(day));
  const answer = tzolkin(jdn(day) + piles);  // счёт идёт вперёд на число кучек
  return { hand, piles, rest, start, answer };
}
