// Тексты дня: шапка клетки календаря и толкование сна.
// Сон толкуется не по образу, а по пересечению образа с днём, в который он приснился.
import { FORCE, STRENGTH } from './data/lords.js';

export const BAD_DAY = 'День не разобран. Впиши его как ГГГГ-ММ-ДД — например 2026-08-11.';
export const START_TEXT = 'Впиши день, в который приснился сон, и образ из него. ' +
  'Тональпоуалли ответит: не образ решает, а его пересечение с днём.';

// подписи клетки календаря
export function cellTexts(day) {
  const { number, sign, pos, nightLord, dir, treSign } = day;
  return {
    name: number + ' ' + sign.nahuatl,
    ru: number + ' ' + sign.ru + '  ·  день ' + (pos + 1) + ' из 260',
    meta:
      'Покровитель знака: ' + sign.god + '\n' +
      'Владыка ночи: ' + nightLord + '\n' +
      'Сторона света: ' + dir + '\n' +
      'Тресена (тринадцатидневье): начата днём 1 ' + treSign.nahuatl + ' — ' + treSign.ru +
      ', её нрав правит всеми тринадцатью днями',
  };
}

// пересечение образа и дня: сила числа решает, как строго день поступает с виденным
function cross(sign, number) {
  const strength = number <= 4 ? STRENGTH.small
    : number <= 9 ? STRENGTH.firm
    : number === 13 ? STRENGTH.limit
    : STRENGTH.great;
  return 'Читай так: то, что день ' + sign.does + ', становится вестью о ' + sign.says +
    '. ' + strength;
}

// полное толкование сна в этот день; image — образ из сна (может быть пустым)
export function readingText(day, image) {
  const { number, sign, nightLord, dir, treSign } = day;
  let t = '';
  t += 'Сон, приснившийся в день ' + number + ' ' + sign.nahuatl +
    ' (' + sign.ru + '), приходит с той стороны, где ' +
    dir.toLowerCase() + '. Говорит ' + sign.god +
    '; за спящим в ту ночь смотрел ' + nightLord + '.\n\n';

  t += 'СИЛА ЧИСЛА ' + number + ' — ' + FORCE[number] + '.\n';
  t += 'ГОЛОС ДНЯ: день ' + sign.does + ' всё, что в нём привиделось; его весть — ' +
    sign.says + '.\n\n';

  if (image.length > 0) {
    t += 'ОБРАЗ «' + image + '» в день ' + sign.ru + ': ';
    t += 'сам по себе он не значит ничего — день ' + sign.does +
      ' его. ' + cross(sign, number) + '\n\n';
  } else t += 'Впиши образ из сна — и станет видно, что день с ним делает.\n\n';

  t += 'ТРЕСЕНА: сон стоит на ' + number + '-м дне тринадцатидневья, начатого днём 1 ' +
    treSign.nahuatl + '. Его общий нрав — ' + treSign.says +
    '; он окрашивает и этот сон.\n\n';

  t += 'ЧТО ДЕЛАТЬ: ' + sign.deed + '. ' +
    'По обычаю толкование не оставляют словами: после дурного сна — окуривание копалом, ' +
    'омовение и малое подношение; после доброго — благодарность тому, кто говорил.';
  return t;
}
