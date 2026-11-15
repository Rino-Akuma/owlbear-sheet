// Кубики. Використовуємо crypto для рівномірного розподілу.

export function rollDie(sides) {
  const max = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= max);
  return (x % sides) + 1;
}

export const d100 = () => rollDie(100);

/** Розбирає «1д8», «2к6+3», «1d4-1». Повертає { count, sides, plus } або null. */
export function parseDice(text) {
  const m = /(\d+)\s*[дкdk]\s*(\d+)(?:\s*([+-])\s*(\d+))?/i.exec(String(text ?? ''));
  if (!m) return null;
  const plus = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return { count: Number(m[1]), sides: Number(m[2]), plus };
}

export function rollDice({ count, sides, plus }) {
  const rolls = [];
  for (let k = 0; k < count; k++) rolls.push(rollDie(sides));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + plus };
}
