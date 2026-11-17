// Ефект закляття D&D: що воно робить і які кубики кидати залежно від ячейки / рівня персонажа.
export const DT_UA = { acid: 'кислота', bludgeoning: 'дробна', cold: 'холод', fire: 'вогонь', force: 'силова', lightning: 'блискавка', necrotic: 'некротична', piercing: 'колюча', poison: 'отрута', psychic: 'психічна', radiant: 'променева', slashing: 'рубляча', thunder: 'грім' };
export const AB_UA = { strength: 'Сила', dexterity: 'Спритність', constitution: 'Статура', intelligence: 'Інтелект', wisdom: 'Мудрість', charisma: 'Харизма' };
const sgn = (n) => (n > 0 ? `+${n}` : String(n));

/** «8d6», «8д6+2», «d4» → {count, sides, plus} */
export function parseD(str) {
  const s = String(str ?? '').trim().replace(/^[dд]/i, '1d');
  const m = /^(\d+)\s*[dдкk]\s*(\d+)(?:\s*([+-])\s*(\d+))?/i.exec(s);
  if (!m) return null;
  return { count: Number(m[1]), sides: Number(m[2]), plus: m[3] ? (m[3] === '-' ? -1 : 1) * Number(m[4]) : 0 };
}
const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Кубики ефекту для заданої ячейки; null, якщо кубиків немає. */
export function effectDice(row, slot, charLevel, mod = 0) {
  let base = parseD(row.dmg);
  if (!base) return null;
  const lvl = Number(row.level) || 0;
  if (lvl === 0 && row.cs && typeof row.cs === 'object') {
    const keys = Object.keys(row.cs).map(Number).filter((k) => k <= (Number(charLevel) || 1)).sort((a, b) => a - b);
    const t = keys.length ? parseD(row.cs[String(keys[keys.length - 1])]) : null;
    if (t) base = t;
  }
  const groups = [{ sides: base.sides, count: base.count }];
  let plus = base.plus || 0;
  let extra = '';
  const up = parseD(row.up);
  if (up && lvl > 0 && Number(slot) > lvl) {
    const n = (Number(slot) - lvl) * up.count;
    if (up.sides === base.sides) groups[0].count += n; else groups.push({ sides: up.sides, count: n });
    extra = `${base.count}д${base.sides} + ${n}д${up.sides} за вищу ячейку`;
  }
  if (row.pm) plus += mod;
  const text = groups.map((g) => `${g.count}д${g.sides}`).join(' + ') + (plus ? sgn(plus) : '');
  return { groups, plus, text, extra };
}

export const effectLabel = (row) => (row.kd === 'h' ? 'Лікування' : row.kd === 'u' ? 'Кубики' : 'Шкода');

/** Коротко: що робить закляття (для картки та для ГМа). */
export function spellFx(row) {
  const out = [];
  if (row.atk) out.push('атака закляттям');
  const sv = list(row.sv).map((x) => AB_UA[x] || x).join('/');
  if (sv) out.push(`спасок ${sv}`);
  if (row.dmg) {
    const dt = list(row.dt).map((x) => DT_UA[x] || x).join('/');
    const d = parseD(row.dmg);
    const dtxt = d ? `${d.count}д${d.sides}${d.plus ? sgn(d.plus) : ''}` : String(row.dmg);
    out.push(`${effectLabel(row).toLowerCase()} ${dtxt}${dt ? ` ${dt}` : ''}${row.pm ? ' + мод.' : ''}`);
    if (row.up) out.push(`+${String(row.up).replace('d', 'д')} за ячейку`);
    if (row.cs) out.push('росте з рівнем');
  } else if (!out.length) out.push('ефект / підсилення');
  if (row.k || /концентрація/i.test(row.dur || '')) out.push('концентрація');
  return out.join(' · ');
}
