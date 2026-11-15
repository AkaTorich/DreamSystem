// Оби: бросок четырёх долей ореха и выбор фигуры по числу «лиц».
import { BY_FACES } from './data/figures.js';

// каждая доля падает лицом (true) или изнанкой (false) с равной долей
export function castLobes() {
  const up = new Array(4);
  let faces = 0;
  for (let i = 0; i < 4; i++) {
    up[i] = Math.floor(Math.random() * 2) === 0;
    if (up[i]) faces++;
  }
  return { up, faces, figure: BY_FACES[faces] };
}

// строка над именем фигуры
export function castLine(castNo, faces) {
  return 'БРОСОК №' + castNo + '  ·  лиц: ' + faces + ' из 4';
}

// подпись под именем фигуры
export function figureLine(f) {
  return f.ru + ' — ' + f.says;
}
