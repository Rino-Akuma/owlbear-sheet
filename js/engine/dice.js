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

// Джерело кубиків можна підмінити (наприклад, 3D-кубики Dice+ в Owlbear). Без нього — crypto.
let provider = null;
export function setProvider(fn) { provider = fn; }

/** Кидає count кубиків із sides граней. Повертає масив значень. */
export async function rollMany(sides, count = 1, meta = {}) {
  if (provider) {
    try {
      const vals = await provider(sides, count, meta);
      if (Array.isArray(vals) && vals.length === count && vals.every((v) => Number.isInteger(v) && v >= 1 && v <= sides)) return vals;
    } catch (e) { console.warn('Зовнішні кубики недоступні, кидаю самостійно:', e.message); }
  }
  return Array.from({ length: count }, () => rollDie(sides));
}

export const d100 = async () => (await rollMany(100, 1))[0];

/** Розбирає «1д8», «2к6+3», «1d4-1». Повертає { count, sides, plus } або null. */
export function parseDice(text) {
  const m = /(\d+)\s*[дкdk]\s*(\d+)(?:\s*([+-])\s*(\d+))?/i.exec(String(text ?? ''));
  if (!m) return null;
  const plus = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return { count: Number(m[1]), sides: Number(m[2]), plus };
}

export async function rollDice({ count, sides, plus }) {
  const rolls = await rollMany(sides, count, { mod: plus });
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) + plus };
}

/** Додаткові кубики з рядка на кшталт «1д4, -1д6, 2к8» → { total, parts[] }. Кидає кожну групу окремо. */
export async function rollExtra(text) {
  const re = /([+-]?)\s*(\d*)\s*[дкdk]\s*(\d+)/gi;
  let total = 0; const parts = []; let m;
  while ((m = re.exec(String(text ?? ''))) !== null) {
    const sign = m[1] === '-' ? -1 : 1;
    const count = Math.min(20, Number(m[2] || 1)); const sides = Number(m[3]);
    if (sides < 2 || sides > 1000) continue;
    const rolls = await rollMany(sides, count, { mod: 0 });
    const sum = rolls.reduce((a, b) => a + b, 0) * sign;
    total += sum;
    parts.push(`${sign < 0 ? '−' : '+'}${count}д${sides}: [${rolls.join(', ')}]`);
  }
  return { total, parts };
}
