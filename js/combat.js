// Логіка черги ініціативи: порядок ходів, пропуск НПС з 0 HP, перехід до наступного.
import { getCombat, setCombat } from './owlbear.js';
import { npcSum } from './npc.js';

export const keyOf = (e) => `${e.k}:${e.id}`;
const numOrNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/** НПС пропускається, якщо в нього 0 HP (і ГМ не повернув його в чергу) або запис зник. */
export function npcSkipped(rec) {
  if (!rec) return true;
  const s = npcSum(rec);
  return s.max > 0 && s.hp <= 0 && !rec.force;
}

/** Збирає порядок: гравці зі зведень + НПС із галочкою «у бою». rows — рядки watchTable, npcs — записи НПС. */
export function buildOrder(rows, npcs) {
  const out = [];
  for (const r of rows || []) {
    const s = r.sum;
    if (!s) continue;
    out.push({ k: 'p', id: r.id, name: String(s.name || 'Гравець'), init: numOrNull(s.init), tok: s.tok || null, skip: false });
  }
  for (const n of npcs || []) {
    if (!n.fight) continue;
    out.push({ k: 'n', id: n.id, name: String((n.data && n.data.name) || 'НПС'), init: numOrNull(n.data && n.data.init_roll), tok: n.tokenId || null, skip: npcSkipped(n) });
  }
  out.sort((a, b) => {
    if (a.init === null && b.init === null) return a.name.localeCompare(b.name);
    if (a.init === null) return 1;
    if (b.init === null) return -1;
    return b.init - a.init || (a.k === b.k ? a.name.localeCompare(b.name) : a.k === 'p' ? -1 : 1);
  });
  return out;
}

export function startState(order, ring = true) {
  let turn = order.findIndex((e) => !e.skip);
  if (turn < 0) turn = 0;
  return { on: true, round: 1, turn, order, ring, t: Date.now() };
}

/** Переносить поточний хід на новий порядок (за ключем запису). Повертає новий стан або null, якщо нічого не змінилось. */
export function reconcile(st, order) {
  if (!st || !st.on) return null;
  const cur = st.order[st.turn];
  let turn = cur ? order.findIndex((e) => keyOf(e) === keyOf(cur)) : -1;
  if (turn < 0) turn = Math.min(st.turn, Math.max(0, order.length - 1));
  const same = JSON.stringify(order) === JSON.stringify(st.order) && turn === st.turn;
  return same ? null : { ...st, order, turn, t: Date.now() };
}

/** Наступний хід, пропускаючи позначених skip; перехід через кінець черги збільшує раунд. */
export function nextState(st, skipFn) {
  const n = st.order.length;
  if (!n) return st;
  let i = st.turn, round = st.round;
  for (let step = 0; step < n; step++) {
    i += 1;
    if (i >= n) { i = 0; round += 1; }
    if (!skipFn(st.order[i])) return { ...st, turn: i, round, t: Date.now() };
  }
  return st;
}

/** Робить наступний хід у сцені. expect — {turn, round}, які бачив той, хто натиснув (захист від подвійного кліку). */
export async function advance(skipFn, expect = null) {
  const st = await getCombat();
  if (!st || !st.on) return;
  if (expect && (expect.turn !== st.turn || expect.round !== st.round)) return;
  await setCombat(nextState(st, skipFn));
}
