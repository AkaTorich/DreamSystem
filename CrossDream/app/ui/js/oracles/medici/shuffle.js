// Тасование колоды: случайный порядок и многократное перемешивание (как Extensions.cs).

const YIELD_EVERY = 20000;   // столько тасований подряд, потом окну даётся вздохнуть

export function shuffle(list) {
  let n = list.length;
  while (n > 1) {
    n--;
    const k = Math.floor(Math.random() * (n + 1));
    const value = list[k];
    list[k] = list[n];
    list[n] = value;
  }
}

// случайный порядок копией (OrderBy(_ => random.Next()) исходника)
export function randomOrder(list) {
  const copy = list.slice();
  shuffle(copy);
  return copy;
}

// перемешать times раз; при большом числе тасований окно не замирает
export async function shuffleMultiple(list, times, token) {
  for (let i = 0; i < times; i++) {
    if (token && token.cancelled) return;
    shuffle(list);
    if ((i + 1) % YIELD_EVERY === 0) await new Promise(r => setTimeout(r));
  }
}
