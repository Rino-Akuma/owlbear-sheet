// Стани персонажів (спільні для листа й панелі ГМа).
export const CONDITIONS = {
  dnd5e: ['Осліплений', 'Зачарований', 'Оглухлий', 'Виснажений', 'Наляканий', 'Схоплений', 'Недієздатний', 'Невидимий',
    'Паралізований', 'Скам’янілий', 'Отруєний', 'Лежачий', 'Обмежений', 'Приголомшений', 'Непритомний', 'Оглушений', 'Концентрація'],
  kontynent: ['Оглушений', 'Отруєний', 'Горить', 'Кровотеча', 'Наляканий', 'Паралізований', 'Непритомний', 'Сповільнений',
    'Осліплений', 'Німий', 'Лежачий', 'Невидимий', 'Схоплений', 'Концентрація'],
};

// Тип стану → колір (контроль, шкода, обмеження руху, відчуття й мова, інше).
export const COND_COLORS = { p: '#b39cf5', d: '#f08a4b', r: '#e6b93c', s: '#5bb8ee', n: '#5fcf8a' };
// [тип, бажані назви іконок game-icons.net, запасні ключові слова для пошуку]
export const COND_META = {
  'Осліплений': ['s', ['blindfold', 'sight-disabled'], ['blind']],
  'Зачарований': ['p', ['hypnosis', 'charm'], ['hypno', 'charm']],
  'Оглухлий': ['s', ['deaf', 'sound-off'], ['deaf']],
  'Виснажений': ['d', ['tired-eye', 'weary'], ['tired', 'exhaust']],
  'Наляканий': ['p', ['screaming', 'terror'], ['scream', 'fear']],
  'Схоплений': ['r', ['grab', 'grasping-claws'], ['grab', 'grasp']],
  'Недієздатний': ['p', ['knockout'], ['knockout', 'incapac']],
  'Невидимий': ['s', ['invisible-face', 'invisible'], ['invisib']],
  'Паралізований': ['p', ['lightning-frequency', 'electric'], ['paraly', 'lightning']],
  'Скам’янілий': ['p', ['stone-bust', 'stone-tower'], ['stone']],
  'Отруєний': ['d', ['poison-bottle', 'poison-cloud'], ['poison']],
  'Лежачий': ['r', ['falling', 'prone'], ['prone', 'falling']],
  'Обмежений': ['r', ['shackles', 'manacles'], ['shackle', 'manacle']],
  'Приголомшений': ['p', ['spinning-top', 'vortex', 'spiral-bloom', 'swirl-ring', 'rolling-energy', 'spiral-arrow'], ['spinning', 'vortex', 'swirl', 'spiral', 'dizz']],
  'Непритомний': ['p', ['night-sleep', 'sleeping'], ['sleep']],
  'Оглушений': ['p', ['star-struck', 'impact-point', 'broken-skull', 'head-shot', 'skull-crack'], ['star-struck', 'impact', 'skull']],
  'Концентрація': ['n', ['meditation', 'bullseye'], ['meditat', 'bullseye']],
  'Горить': ['d', ['flame', 'burning-embers'], ['burning', 'flame']],
  'Кровотеча': ['d', ['bleeding-wound', 'blood'], ['bleed', 'blood']],
  'Сповільнений': ['r', ['snail', 'turtle'], ['snail', 'slow']],
  'Німий': ['s', ['silence', 'mute'], ['mute', 'silence']],
};
export const condKey = (n) => String(n).replace(/'/g, '’');
export const condColor = (n) => COND_COLORS[(COND_META[condKey(n)] || ['n'])[0]];
