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
// provider(notation, groups) → масив кубиків [{value, kept}] у порядку груп.
let provider = null;
export function setProvider(fn) { provider = fn; }

/** «2d20kh1+1d4-1d6+3» з груп [{sides,count,keep,sign}] і модифікатора. */
export function buildNotation(groups, mod = 0) {
  let s = '';
  groups.forEach((g, i) => { s += (g.sign < 0 ? '-' : i ? '+' : '') + `${g.count}d${g.sides}${g.keep || ''}`; });
  if (mod) s += (mod > 0 ? '+' : '') + mod;
  return s;
}

function localGroup(g) {
  const vals = Array.from({ length: g.count }, () => rollDie(g.sides));
  const km = /^k([hl])(\d+)$/.exec(g.keep || '');
  const kept = vals.map(() => true);
  if (km) {
    const n = Number(km[2]);
    const order = vals.map((v, i) => i).sort((a, b) => (km[1] === 'h' ? vals[b] - vals[a] : vals[a] - vals[b]));
    kept.fill(false);
    order.slice(0, n).forEach((i) => { kept[i] = true; });
  }
  return vals.map((value, i) => ({ value, kept: kept[i] }));
}

/**
 * Один кидок усього пулу: групи кубиків + плоский модифікатор → ОДИН запит до Dice+.
 * Повертає { groups:[{sides,count,keep,sign,dice:[{value,kept}],sum}], mod, total, notation }.
 */
export async function rollPool(groups, mod = 0) {
  groups = groups.map((g) => ({ sign: 1, keep: '', ...g }));
  const notation = buildNotation(groups, mod);
  let dice = null;
  if (provider) {
    try {
      const flat = await provider(notation, groups);
      const need = groups.reduce((a, g) => a + g.count, 0);
      if (Array.isArray(flat) && flat.length === need && flat.every((d) => Number.isInteger(d.value) && d.value >= 1)) {
        let k = 0;
        dice = groups.map((g) => flat.slice(k, (k += g.count)).map((d) => ({ value: d.value, kept: d.kept !== false })));
      }
    } catch (e) { console.warn('Зовнішні кубики недоступні, кидаю самостійно:', e.message); }
  }
  if (!dice) dice = groups.map(localGroup);
  const out = groups.map((g, i) => ({ ...g, dice: dice[i], sum: dice[i].filter((d) => d.kept).reduce((a, d) => a + d.value, 0) }));
  const total = out.reduce((a, g) => a + g.sign * g.sum, 0) + mod;
  return { groups: out, mod, total, notation };
}

/** Значення кубиків групи; kept-значення окремо. */
export const keptVals = (g) => g.dice.filter((d) => d.kept).map((d) => d.value);
export const allVals = (g) => g.dice.map((d) => d.value);

/** Короткий опис групи: «+1д4: [3]» або «2д20 (кращий): [5, 17→17]». */
export function describeGroup(g) {
  const sign = g.sign < 0 ? '−' : '+';
  const vals = g.dice.map((d) => (d.kept ? String(d.value) : `~${d.value}~`)).join(', ');
  return `${sign}${g.count}д${g.sides}: [${vals}]`;
}

export const d100 = async () => keptVals((await rollPool([{ sides: 100, count: 1 }])).groups[0])[0];

/** Розбирає «1д8», «2к6+3», «1d4-1». Повертає { count, sides, plus } або null. */
export function parseDice(text) {
  const m = /(\d+)\s*[дкdk]\s*(\d+)(?:\s*([+-])\s*(\d+))?/i.exec(String(text ?? ''));
  if (!m) return null;
  const plus = m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0;
  return { count: Number(m[1]), sides: Number(m[2]), plus };
}

export async function rollDice({ count, sides, plus }) {
  const r = await rollPool([{ sides, count }], plus);
  return { rolls: keptVals(r.groups[0]), total: r.total, notation: r.notation };
}

/** Додаткові кубики з рядка «1д4, -1д6, 2к8» → групи для rollPool. */
export function parseExtra(text) {
  const re = /([+-]?)\s*(\d*)\s*[дкdk]\s*(\d+)/gi;
  const out = []; let m;
  while ((m = re.exec(String(text ?? ''))) !== null) {
    const count = Math.min(20, Number(m[2] || 1)); const sides = Number(m[3]);
    if (sides < 2 || sides > 1000) continue;
    out.push({ sides, count, sign: m[1] === '-' ? -1 : 1 });
  }
  return out;
}
