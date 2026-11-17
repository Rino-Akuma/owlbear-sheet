// Картка закляття D&D: опис, що воно робить, вибір ячейки (кубики ростуть самі), кидки.
import { rollPool, describeGroup, keptVals } from './engine/dice.js';
import { effectDice, effectLabel, spellFx } from './spellfx.js';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== undefined && kid !== null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const slotInfo = (ctx, n) => {
  const total = Number(ctx.data[`slots${n}`]) || 0;
  const left = ctx.data[`slotsleft${n}`] == null ? total : Number(ctx.data[`slotsleft${n}`]) || 0;
  return { total, left };
};
const isConc = (row) => /концентрація/i.test(row.dur || '') || !!row.k;

/** host: { stats(row) → {dc, atk}, level(), mod(row) } */
export async function castSpell(ctx, row, host, opt = {}) {
  const lvl = Number(row.level) || 0;
  const slot = Math.max(lvl, Number(opt.slot) || lvl);
  const lines = [];
  if (opt.cast !== false) {
    if (lvl > 0 && !row.free && opt.spend !== false) {
      const { total, left } = slotInfo(ctx, slot);
      if (total > 0 && left <= 0) return ctx.log({ title: `Вимовлено: ${row.name}`, lines: [`Немає ячейок ${slot}-го рівня`], success: false, crit: null });
      if (total > 0) { ctx.setData(`slotsleft${slot}`, left - 1); lines.push(`Ячейка ${slot}-го рівня: лишилось ${left - 1} з ${total}`); }
      else lines.push(`Ячейка ${slot}-го рівня (ячейки не налаштовано — не витрачено)`);
    } else if (row.free) lines.push('Без ячейки (особливість риси)');
    else if (lvl === 0) lines.push('Замовляння не витрачає ячейку');
    if (isConc(row)) {
      const cur = Array.isArray(ctx.data.conditions) ? ctx.data.conditions : [];
      if (!cur.includes('Концентрація')) ctx.data.conditions = [...cur, 'Концентрація'];
      lines.push('Концентрація: попереднє закляття-концентрація закінчується');
    }
    const st = host.stats(row);
    if (row.sv) lines.push(`Спасок ${[].concat(row.sv).map((x) => ({ strength: 'Сили', dexterity: 'Спритності', constitution: 'Статури', intelligence: 'Інтелекту', wisdom: 'Мудрості', charisma: 'Харизми' })[x] || x).join('/')}: СЛ ${st.dc}`);
    ctx.touch();
    ctx.log({ title: `Вимовлено: ${row.name}${lvl > 0 && slot > lvl ? ` (ячейка ${slot})` : ''}`, lines: lines.length ? lines : [''], success: null, crit: null });
  }
  if (opt.attack && row.atk !== 0 && row.atk !== false) await ctx.rollD20(`Атака закляттям: ${row.name}`, host.stats(row).atk);
  if (opt.effect) await rollEffect(ctx, row, host, slot);
}

export async function rollEffect(ctx, row, host, slot) {
  const fx = effectDice(row, slot ?? row.level, host.level(), host.mod(row));
  if (!fx) return ctx.log({ title: row.name || 'Ефект', lines: ['Вкажіть кубики (наприклад 8д6) у колонці «Шкода»'], success: null, crit: null });
  const label = `${effectLabel(row)} ${row.name || ''}`;
  const pool = await rollPool(fx.groups, fx.plus, label);
  const parts = pool.groups.map((g) => describeGroup(g).replace(/^\+/, ''));
  if (fx.plus) parts.push(fx.plus > 0 ? `+${fx.plus}` : String(fx.plus));
  ctx.log({
    title: `${effectLabel(row)}: ${row.name}${Number(slot) > Number(row.level) ? ` (ячейка ${slot})` : ''}`,
    lines: [`${fx.text}${fx.extra ? ` (${fx.extra})` : ''}`, parts.join(' ')], success: null, crit: null, headline: pool.total,
  });
}

export function openSpellCard(ctx, row, host) {
  const root = document.getElementById('modal-root');
  const close = () => root.replaceChildren();
  const lvl = Number(row.level) || 0;
  const charLevel = host.level();
  let slot = lvl;
  const levels = [];
  if (lvl > 0) for (let n = lvl; n <= 9; n++) if (n === lvl || slotInfo(ctx, n).total > 0) levels.push(n);
  const firstFree = levels.find((n) => { const s = slotInfo(ctx, n); return s.total === 0 || s.left > 0; });
  if (firstFree) slot = firstFree;

  const meta = [lvl === 0 ? 'замовляння' : `${lvl}-й рівень`, row.school, row.time, row.range, row.comps, row.dur, row.from ? `від: ${row.from}` : ''].filter(Boolean).join(' · ');
  const fxLine = h('div', { class: 'sc-fx' });
  const diceLine = h('div', { class: 'sc-dice' });
  const slotSel = h('select', { class: 'sc-slot' });
  const spendBox = h('input', { type: 'checkbox', checked: true });
  const concNote = isConc(row) && (ctx.data.conditions || []).includes('Концентрація')
    ? h('div', { class: 'sc-warn', text: 'Ви вже тримаєте концентрацію — нове закляття її перерве.' }) : null;

  const refresh = () => {
    const fx = effectDice(row, slot, charLevel, host.mod(row));
    diceLine.textContent = fx ? `${effectLabel(row)}: ${fx.text}${fx.extra ? ` (${fx.extra})` : ''}` : '';
    diceLine.hidden = !fx;
    slotSel.replaceChildren(...levels.map((n) => {
      const s = slotInfo(ctx, n);
      return h('option', { value: String(n), selected: n === slot, text: `${n}-й рівень${s.total ? ` (лишилось ${s.left} з ${s.total})` : ''}` });
    }));
  };
  slotSel.addEventListener('change', () => { slot = Number(slotSel.value); refresh(); });
  fxLine.textContent = spellFx(row);

  const hasEffect = !!effectDice(row, lvl, charLevel, 0);
  const act = async (opt) => { await castSpell(ctx, row, host, { slot, spend: spendBox.checked, ...opt }); refresh(); ctx.redraw(); };
  const noSlot = lvl === 0 || row.free;

  const descView = h('div', { class: 'desc-text', text: row.text || 'Опису немає. Натисніть «Редагувати опис», щоб додати.' });
  const descEdit = h('textarea', { class: 'desc-area', rows: '10', hidden: true });
  descEdit.value = row.text || '';
  descEdit.addEventListener('input', () => { row.text = descEdit.value; descView.textContent = row.text; ctx.touch(); });
  const editBtn = h('button', { type: 'button', class: 'link', text: 'Редагувати опис', onclick: () => { descEdit.hidden = !descEdit.hidden; descView.hidden = !descEdit.hidden; } });

  const box = h('div', { class: 'modal wide spell-card', role: 'dialog' },
    h('h3', { text: row.name || 'Закляття' }),
    h('div', { class: 'muted small', text: meta }),
    fxLine,
    concNote,
    noSlot ? null : h('label', { class: 'field sc-slot-row' }, 'Ячейка', slotSel),
    diceLine,
    noSlot ? null : h('label', { class: 'sc-spend' }, spendBox, ' Витратити ячейку'),
    h('div', { class: 'sc-actions' },
      h('button', { type: 'button', class: 'primary', text: 'Вимовити', title: 'Витрачає ячейку і кидає атаку та ефект', onclick: () => act({ attack: true, effect: true }) }),
      row.atk ? h('button', { type: 'button', text: 'Лише атака', onclick: () => act({ cast: false, attack: true }) }) : null,
      hasEffect ? h('button', { type: 'button', text: `Лише ${effectLabel(row).toLowerCase()}`, onclick: () => act({ cast: false, effect: true }) }) : null),
    h('div', { class: 'sc-desc' }, descView, descEdit, editBtn),
    h('div', { class: 'modal-actions' }, h('button', { type: 'button', text: 'Закрити', onclick: close })));
  root.replaceChildren(h('div', { class: 'backdrop', onclick: (e) => { if (e.target.classList.contains('backdrop')) close(); } }, box));
  refresh();
}
