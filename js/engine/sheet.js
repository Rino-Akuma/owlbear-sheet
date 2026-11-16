// Рушій листа: читає шаблон системи, малює форму, рахує формули, виконує кидки.
// Про жодну конкретну систему (D&D, «Континент») тут нічого не відомо.

import { compile } from './formula.js';
import { d100, rollPool, describeGroup, keptVals } from './dice.js';
import { pickFromLibrary, showTextModal } from '../library.js';
import { t } from '../i18n.js';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function fmt(v, format) {
  if (!Number.isFinite(v)) return '—';
  const n = Number.isInteger(v) ? v : Math.round(v * 10) / 10;
  if (format === 'signed') return n >= 0 ? `+${n}` : String(n);
  return String(n);
}

const optValue = (o) => (typeof o === 'object' ? o.value : o);
const optLabel = (o) => (typeof o === 'object' ? o.label ?? o.value : o);

/** Збирає всі поля шаблону (з секцій, вкладок і з прихованих обчислюваних). */
function indexFields(template) {
  const byId = new Map();
  const add = (f) => {
    if (!f.id) return;
    if (byId.has(f.id)) throw new Error(`Шаблон: повторюється id «${f.id}»`);
    byId.set(f.id, f);
  };
  // Блок характеристики автоматично створює: id_mod, id_save (володіння), id_savemod, а для кожної навички id та id_val.
  const addField = (f) => {
    add(f);
    if (f.type !== 'ability') return;
    add({ type: 'computed', hidden: true, id: `${f.id}_mod`, formula: `floor((${f.id} - 10) / 2)` });
    add({ type: 'number', hidden: true, id: `${f.id}_save` });
    add({ type: 'computed', hidden: true, id: `${f.id}_savemod`, formula: `${f.id}_mod + ${f.id}_save * pb` });
    for (const sk of f.skills || []) {
      add({ type: 'number', hidden: true, id: sk.id });
      add({ type: 'computed', hidden: true, id: `${sk.id}_val`, formula: `${f.id}_mod + ${sk.id} * pb` });
    }
  };
  (template.computed || []).forEach((c) => add({ type: 'computed', hidden: true, ...c }));
  for (const s of template.sections || []) {
    (s.fields || []).forEach(addField);
    for (const tab of s.tabs || []) (tab.fields || []).forEach(addField);
  }
  return byId;
}

/** Перевіряє шаблон і компілює формули. Кидає зрозумілу помилку українською. */
export function prepareTemplate(template) {
  if (!template || typeof template !== 'object') throw new Error('Шаблон порожній');
  if (!template.id || !template.name) throw new Error('У шаблоні немає id або назви');
  const byId = indexFields(template);
  const compileInto = (obj, key, target) => {
    if (obj[key] === undefined || obj[key] === '') return;
    obj[target] = compile(obj[key]);
  };
  for (const f of byId.values()) {
    if (f.type === 'computed') {
      if (!f.formula) throw new Error(`Поле «${f.id}»: немає формули`);
      compileInto(f, 'formula', '_c');
    }
    if (f.type === 'counter') compileInto(f, 'max', '_max');
    if (f.type === 'note') compileInto(f, 'showIf', '_show');
    if (f.type === 'roll') compileInto(f, 'mod', '_mod');
  }
  for (const g of template.rolls || []) {
    for (const item of g.items || []) {
      compileInto(item, 'mod', '_mod');
      if (item._mod) {
        for (const d of item._mod.deps) {
          if (!byId.has(d)) throw new Error(`Кидок «${item.label}»: у формулі невідоме поле «${d}»`);
        }
      }
      if (item.stat && !byId.has(item.stat)) throw new Error(`Кидок «${item.label}»: невідоме поле «${item.stat}»`);
    }
  }
  for (const f of byId.values()) {
    for (const key of ['_c', '_max', '_show', '_mod']) {
      if (!f[key]) continue;
      for (const d of f[key].deps) {
        if (!byId.has(d)) throw new Error(`Поле «${f.id}»: у формулі невідоме поле «${d}»`);
      }
    }
  }
  return byId;
}

/**
 * Малює лист у root.
 * hooks: { onChange(), getOpts() -> {difficulty, bonus, critHi, critLo}, log(entry) }
 * Повертає { destroy() }.
 */
const TAB_MEMORY = {};
const PAGE_MEMORY = {};
export function mountSheet(root, template, data, hooks) {
  const byId = prepareTemplate(template);
  const actions = template.actions || {};
  const updaters = [];
  let cache = new Map();
  const stack = new Set();

  function get(name) {
    if (cache.has(name)) return cache.get(name);
    const f = byId.get(name);
    if (!f) return 0;
    if (stack.has(name)) { console.warn('Циклічна залежність:', name); return 0; }
    stack.add(name);
    let v;
    if (f.type === 'computed') v = f._c.fn(get);
    else if (f.type === 'checkbox') v = data[name] ? 1 : 0;
    else if (f.type === 'counter') v = data[name] == null ? maxOf(f) : Number(data[name]) || 0;
    else v = Number(data[name] ?? f.default ?? 0) || 0;
    stack.delete(name);
    cache.set(name, v);
    return v;
  }
  const maxOf = (f) => (f._max ? Math.max(0, Math.floor(f._max.fn(get))) : Number(f.maxValue ?? 0));

  function refresh() {
    if (typeof template.derive === 'function') template.derive(data);
    cache = new Map();
    updaters.forEach((u) => u());
  }
  function changed() {
    hooks.onChange();
    refresh();
  }

  const ctx = {
    get,
    data,
    opts: () => hooks.getOpts(),
    log: (e) => hooks.log(e),
    d100,
    rollPool,
    setData(id, val) { data[id] = val; changed(); },
    touch: changed,
    redraw: () => (hooks.redraw || refresh)(),
    showText: (cfg) => showTextModal(cfg),
    addRow(listId, row) { if (!Array.isArray(data[listId])) data[listId] = []; data[listId].push(row); },
    appendLine(id, line) { const cur = String(data[id] ?? ''); data[id] = cur ? `${cur}\n${line}` : line; },
    t,
  };

  function pickButton(f) {
    const cfg = f.pick;
    return h('button', {
      type: 'button', class: 'link lib-btn', text: cfg.label || t.libPick,
      onclick: async (ev) => {
        ev.preventDefault();
        const entry = await pickFromLibrary(cfg);
        if (!entry) return;
        const fn = actions[cfg.action];
        if (!fn) return;
        await fn(ctx, entry, f);
        hooks.onChange();
        (hooks.redraw || refresh)();
      },
    });
  }

  // ---------- рендер полів ----------
  function labelWrap(f, control, extraClass = '') {
    return h('label', { class: `field ${extraClass}`, style: f.span ? `grid-column: span ${f.span}` : null },
      h('span', { class: 'lbl' }, f.label || '', f.pick ? pickButton(f) : null), control);
  }

  function renderText(f) {
    const input = h('input', { type: 'text', value: data[f.id] ?? f.default ?? '', placeholder: f.placeholder || '' });
    input.addEventListener('input', () => { data[f.id] = input.value; changed(); });
    updaters.push(() => { const v = data[f.id] ?? f.default ?? ''; if (document.activeElement !== input && input.value !== String(v)) input.value = v; });
    return labelWrap(f, input);
  }

  function renderLongText(f) {
    const ta = h('textarea', { rows: f.rows || 3 });
    ta.value = data[f.id] ?? f.default ?? '';
    ta.addEventListener('input', () => { data[f.id] = ta.value; changed(); });
    return labelWrap(f, ta);
  }

  function renderNumber(f) {
    const input = h('input', { type: 'number', min: f.min, max: f.max, step: f.step || 1, value: data[f.id] ?? f.default ?? 0 });
    input.addEventListener('input', () => {
      data[f.id] = input.value === '' ? 0 : Number(input.value);
      changed();
    });
    updaters.push(() => { const v = data[f.id] ?? f.default ?? 0; if (document.activeElement !== input && String(input.value) !== String(v)) input.value = v; });
    return labelWrap(f, input);
  }

  function renderCheckbox(f) {
    const input = h('input', { type: 'checkbox', checked: !!(data[f.id] ?? f.default) });
    input.addEventListener('change', () => { data[f.id] = input.checked; changed(); });
    return h('label', { class: 'field check', style: f.span ? `grid-column: span ${f.span}` : null }, input, h('span', { text: f.label }));
  }

  function renderSelect(f) {
    const sel = h('select', {}, (f.options || []).map((o) => h('option', { value: optValue(o), text: optLabel(o) })));
    sel.value = data[f.id] ?? f.default ?? optValue((f.options || [''])[0]);
    sel.addEventListener('change', () => { data[f.id] = sel.value; changed(); });
    return labelWrap(f, sel);
  }

  function renderComputed(f) {
    const out = h('b', { class: 'val' });
    updaters.push(() => { out.textContent = fmt(get(f.id), f.format); });
    return h('div', { class: 'field computed', style: f.span ? `grid-column: span ${f.span}` : null },
      h('span', { class: 'lbl', text: f.label }), out, f.hint ? h('small', { text: f.hint }) : null);
  }

  function renderStat(f) {
    const input = h('input', { type: 'number', class: 'stat-input', min: f.min ?? 0, max: f.max ?? 200, value: data[f.id] ?? f.default ?? 0 });
    input.addEventListener('input', () => { data[f.id] = input.value === '' ? 0 : Number(input.value); changed(); });
    const eff = h('span', { class: 'stat-eff' });
    const mod = h('span', { class: 'stat-mod' });
    updaters.push(() => {
      const base = get(f.id);
      const e = f.eff ? get(f.eff) : base;
      eff.textContent = e !== base ? `${t.effective}: ${fmt(e)}` : '';
      eff.classList.toggle('debuff', e < base);
      mod.textContent = f.mod ? fmt(get(f.mod), 'signed') : '';
    });
    return h('div', { class: 'stat-card' },
      h('div', { class: 'stat-name', text: f.label }), input, mod, eff);
  }

  function renderCounter(f) {
    const input = h('input', { type: 'number', min: f.min ?? 0, step: 1 });
    const maxEl = h('span', { class: 'counter-max' });
    const set = (v) => {
      const max = maxOf(f);
      let n = Math.max(f.min ?? 0, Number.isFinite(v) ? v : 0);
      if (!f.allowOver) n = Math.min(n, max);
      data[f.id] = n;
      changed();
    };
    input.addEventListener('change', () => set(Number(input.value)));
    const minus = h('button', { type: 'button', class: 'mini', text: '−', title: '−1', onclick: () => set(get(f.id) - 1) });
    const plus = h('button', { type: 'button', class: 'mini', text: '+', title: '+1', onclick: () => set(get(f.id) + 1) });
    updaters.push(() => {
      input.value = get(f.id);
      maxEl.textContent = `/ ${maxOf(f)}`;
    });
    return h('div', { class: `field counter ${f.class || ''}`, style: f.span ? `grid-column: span ${f.span}` : null },
      h('span', { class: 'lbl', text: f.label }), h('div', { class: 'counter-row' }, minus, input, maxEl, plus));
  }

  function renderSlots(f) {
    const rows = [];
    const levels = f.levels || 9;
    const leftEls = [];
    for (let n = 1; n <= levels; n++) {
      const tk = `slots${n}`, lk = `slotsleft${n}`;
      const total = h('input', { type: 'number', min: 0, max: 20, class: 'slot-total' });
      const left = h('span', { class: 'slot-left' });
      const total0 = () => Number(data[tk]) || 0;
      const cur = () => (data[lk] == null ? total0() : Math.min(Number(data[lk]) || 0, total0()));
      total.addEventListener('input', () => { data[tk] = Math.max(0, Number(total.value) || 0); if (data[lk] != null) data[lk] = Math.min(Number(data[lk]) || 0, data[tk]); changed(); });
      const minus = h('button', { type: 'button', class: 'mini', text: '−', onclick: () => { data[lk] = Math.max(0, cur() - 1); changed(); } });
      const plus = h('button', { type: 'button', class: 'mini', text: '+', onclick: () => { data[lk] = Math.min(total0(), cur() + 1); changed(); } });
      updaters.push(() => { total.value = total0(); left.textContent = String(cur()); });
      rows.push(h('tr', {}, h('th', { text: `${n}-й` }), h('td', {}, total), h('td', { class: 'slot-ctl' }, minus, left, plus)));
    }
    const rest = h('button', { type: 'button', class: 'link', text: t.longRest, onclick: () => { for (let n = 1; n <= levels; n++) delete data[`slotsleft${n}`]; changed(); } });
    const table = h('table', { class: 'slots' }, h('thead', {}, h('tr', {}, h('th', { text: 'Рівень' }), h('th', { text: t.slotsTotal }), h('th', { text: t.slotsLeft }))), h('tbody', {}, rows));
    return h('div', { class: 'field slots-wrap', style: f.span ? `grid-column: span ${f.span}` : null },
      h('span', { class: 'lbl' }, f.label || '', ' ', rest), table);
  }

  function renderTrack(f) {
    const max = f.max || 5;
    const pips = [];
    for (let k = 1; k <= max; k++) {
      pips.push(h('button', {
        type: 'button', class: 'pip', title: String(k), text: String(k),
        onclick: () => { data[f.id] = (Number(data[f.id]) || 0) === k ? k - 1 : k; changed(); },
      }));
    }
    updaters.push(() => { const v = get(f.id); pips.forEach((p, idx) => p.classList.toggle('on', idx < v)); });
    return h('div', { class: 'field track', style: f.span ? `grid-column: span ${f.span}` : null },
      h('span', { class: 'lbl', text: f.label }), h('div', { class: 'pips' }, pips));
  }

  function renderNote(f) {
    const el = h('p', { class: 'note', text: f.text, style: f.span ? `grid-column: span ${f.span}` : null });
    updaters.push(() => { el.hidden = f._show ? !f._show.fn(get) : false; });
    if (f.pick) return h('div', { class: 'note-pick', style: f.span ? `grid-column: span ${f.span}` : null }, el, pickButton(f));
    return el;
  }

  // ---------- кидки ----------
  function outcomeEntry(def, nat, lines, success) {
    const o = hooks.getOpts();
    const crit = def.die === 20
      ? (nat === 20 ? 'success' : nat === 1 ? 'fail' : null)
      : (nat >= o.critHi ? 'success' : nat <= o.critLo ? 'fail' : null);
    return { title: def.label, lines, success, crit };
  }

  /** d20 з перевагою/недоліком, бонусом і складністю з панелі кидків. */
  async function rollD20(title, mod, extra = []) {
    const o = hooks.getOpts();
    const adv = o.adv || 0;
    const bonus = o.bonus || 0;
    const pool = await rollPool(
      [{ sides: 20, count: adv ? 2 : 1, keep: adv > 0 ? 'kh1' : adv < 0 ? 'kl1' : '' }],
      mod + bonus,
    );
    const g0 = pool.groups[0];
    const nat = keptVals(g0)[0];
    const total = pool.total;
    const parts = [adv ? `d20: ${g0.dice.map((d) => d.value).join(', ')} (${adv > 0 ? t.advantage : t.disadvantage}) → ${nat}` : `d20: ${nat}`];
    parts.push(`${t.modifier}: ${fmt(mod, 'signed')}`);
    if (bonus) parts.push(`${t.bonus}: ${fmt(bonus, 'signed')}`);
    parts.push(...pool.groups.slice(1).map(describeGroup));
    const dc = o.difficulty || 0;
    const entry = {
      title,
      lines: [`${parts.join(' · ')} = ${total}`, ...(dc ? [t.vsDc(dc)] : []), ...extra],
      success: dc ? total >= dc : null,
      crit: nat === 20 ? 'success' : nat === 1 ? 'fail' : null,
      headline: total,
    };
    hooks.log(entry);
    return entry;
  }
  ctx.rollD20 = rollD20;

  async function doRoll(def) {
    const o = hooks.getOpts();
    const mode = def.mode || 'check';
    const die = def.die || 100;
    if (die === 20 && mode === 'check' && template.rollOptions === 'd20') {
      return await rollD20(def.label, def._mod ? Math.floor(def._mod.fn(get)) : 0);
    }
    const mod = def._mod ? Math.floor(def._mod.fn(get)) : 0;
    const bonus = die === 100 ? o.bonus : 0;
    const pool = await rollPool(
      [{ sides: die, count: 1 }],
      mode === 'save' ? 0 : mod + bonus,
    );
    const nat = pool.groups[0].dice[0].value;
    const total = pool.total;
    const parts = [`d${die}: ${nat}`];
    if (def._mod) parts.push(`${t.modifier}: ${fmt(mod, 'signed')}`);
    if (bonus) parts.push(`${t.bonus}: ${fmt(bonus, 'signed')}`);
    const exParts = pool.groups.slice(1).map(describeGroup);
    parts.push(...exParts);
    const sum = `${parts.join(' · ')}${def._mod || bonus || exParts.length ? ` = ${total}` : ''}`;
    let entry;
    if (mode === 'save') {
      const stat = get(def.stat);
      const ok = nat < stat;
      entry = outcomeEntry(def, nat, [`d${die}: ${nat}`, `${t.saveRule(stat)}`], ok);
    } else if (mode === 'table') {
      const rows = [...def.table].sort((a, b) => b.min - a.min);
      const hit = rows.find((r) => total >= r.min) || rows[rows.length - 1];
      entry = outcomeEntry(def, nat, [sum, `→ ${hit.text}`], null);
    } else if (mode === 'threshold') {
      const ok = total >= def.min;
      entry = outcomeEntry(def, nat, [sum, t.thresholdRule(def.min)], ok);
    } else if (die !== 100) {
      entry = { title: def.label, lines: [sum], success: null, crit: null };
    } else {
      const diff = o.difficulty;
      if (diff > 0) {
        const ok = total > diff;
        entry = outcomeEntry(def, nat, [sum, t.vsDifficulty(diff)], ok);
      } else {
        entry = outcomeEntry(def, nat, [sum], null);
      }
    }
    entry.headline = mode === 'save' ? nat : total;
    hooks.log(entry);
  }

  function renderRoll(f) {
    return h('button', {
      type: 'button', class: 'roll-btn', title: f.hint || '', onclick: () => doRoll(f),
    }, h('span', { class: 'roll-ico', text: '🎲' }), h('span', { text: f.label }));
  }

  // ---------- списки ----------
  function renderList(f) {
    if (!Array.isArray(data[f.id])) data[f.id] = [];
    const rows = data[f.id];
    const tbody = h('tbody');
    const cols = f.columns || [];
    const newRow = () => {
      const r = {};
      cols.forEach((c) => { if (c.default !== undefined) r[c.id] = c.default; });
      return r;
    };

    function cell(c, row) {
      let ctl;
      if (c.type === 'select') {
        ctl = h('select', {}, (c.options || []).map((o) => h('option', { value: optValue(o), text: optLabel(o) })));
        ctl.value = row[c.id] ?? c.default ?? optValue((c.options || [''])[0]);
        if (row[c.id] === undefined) row[c.id] = ctl.value;
        ctl.addEventListener('change', () => { row[c.id] = ctl.value; changed(); });
      } else if (c.type === 'checkbox') {
        ctl = h('input', { type: 'checkbox', checked: !!row[c.id] });
        ctl.addEventListener('change', () => { row[c.id] = ctl.checked; changed(); });
      } else if (c.type === 'number') {
        ctl = h('input', { type: 'number', step: c.step || 1, min: c.min, max: c.max, value: row[c.id] ?? c.default ?? 0 });
        ctl.addEventListener('input', () => { row[c.id] = ctl.value === '' ? 0 : Number(ctl.value); changed(); });
      } else {
        ctl = h('input', { type: 'text', value: row[c.id] ?? '', placeholder: c.placeholder || '' });
        ctl.addEventListener('input', () => { row[c.id] = ctl.value; changed(); });
      }
      return h('td', { class: c.type === 'checkbox' ? 'c-check' : '', 'data-label': c.label }, ctl);
    }

    function renderRows() {
      tbody.replaceChildren();
      rows.forEach((row, idx) => {
        const acts = (f.rowActions || []).map((a) => h('button', {
          type: 'button', class: 'mini act', text: a.label, title: a.hint || '',
          onclick: () => {
            const fn = actions[a.action];
            if (!fn) return hooks.log({ title: a.label, lines: [t.noAction], success: null, crit: null });
            fn(ctx, row, a);
          },
        }));
        const del = h('button', {
          type: 'button', class: 'mini danger', text: '×', title: t.removeRow,
          onclick: () => { rows.splice(idx, 1); renderRows(); changed(); },
        });
        tbody.append(h('tr', {}, cols.map((c) => cell(c, row)), h('td', { class: 'c-act' }, ...acts, del)));
      });
      if (!rows.length) {
        tbody.append(h('tr', { class: 'empty' }, h('td', { colspan: cols.length + 1, text: f.empty || t.emptyList })));
      }
    }
    renderRows();

    const table = h('table', { class: 'list', style: f.minWidth ? `min-width:${f.minWidth}` : null },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { text: c.label, style: c.width ? `width:${c.width}` : null })), h('th'))),
      tbody);
    const add = h('button', {
      type: 'button', class: 'add', text: `+ ${f.addLabel || t.add}`,
      onclick: () => { rows.push(newRow()); renderRows(); changed(); },
    });
    return h('div', { class: 'list-wrap', style: f.span ? `grid-column: span ${f.span}` : null },
      f.label ? h('div', { class: 'lbl', text: f.label }) : null, h('div', { class: 'scroll-x' }, table),
      h('div', { class: 'list-btns' }, add, f.pick ? pickButton(f) : null));
  }

  // ---------- блок характеристики (як на Long Story Short) ----------
  function profDot(id, maxLevel) {
    const dot = h('button', {
      type: 'button', class: 'dot', title: t.profTitle,
      onclick: () => {
        const cur = Number(data[id]) || 0;
        data[id] = cur + 1 > maxLevel ? 0 : cur + 1;
        changed();
      },
    });
    updaters.push(() => { dot.className = `dot p${get(id)}`; });
    return dot;
  }

  function rollButton(title, valueId) {
    const b = h('button', { type: 'button', class: 'val-btn', title: t.rollIt, onclick: () => rollD20(title, get(valueId)) });
    updaters.push(() => { b.textContent = fmt(get(valueId), 'signed'); });
    return b;
  }

  function renderAbility(f) {
    const score = h('input', { type: 'number', class: 'ab-score', min: 1, max: 30, value: data[f.id] ?? f.default ?? 10 });
    score.addEventListener('input', () => { data[f.id] = score.value === '' ? 10 : Number(score.value); changed(); });
    const head = h('div', { class: 'ab-head' }, h('span', { class: 'ab-name', text: f.label }), h('span', { class: 'ab-line' }), score);
    const check = h('div', { class: 'pill' }, h('span', { class: 'pill-l', text: t.checkShort }), rollButton(`${f.label}: ${t.checkLower}`, `${f.id}_mod`));
    const save = h('div', { class: 'pill' }, profDot(`${f.id}_save`, 1), h('span', { class: 'pill-l', text: t.saveShort }),
      rollButton(`${f.label}: ${t.savingThrowLower}`, `${f.id}_savemod`));
    const skills = (f.skills || []).map((sk) => h('div', { class: 'skill' },
      profDot(sk.id, 2), h('span', { class: 'skill-name', text: sk.label }), rollButton(`${sk.label} (${f.label})`, `${sk.id}_val`)));
    return h('div', { class: 'ability' }, head, h('div', { class: 'ab-row' }, check, save), skills);
  }

  function renderChips(f) {
    const read = () => (Array.isArray(data[f.id]) ? data[f.id] : []);
    const btns = (f.options || []).map((o) => h('button', {
      type: 'button', class: 'chip-btn', text: o,
      onclick: () => { const a = read(); data[f.id] = a.includes(o) ? a.filter((x) => x !== o) : [...a, o]; changed(); },
    }));
    updaters.push(() => { const a = read(); btns.forEach((b, i) => b.classList.toggle('on', a.includes(f.options[i]))); });
    return h('div', { class: 'field chips-field', style: f.span ? `grid-column: span ${f.span}` : null },
      f.label ? h('span', { class: 'lbl', text: f.label }) : null, h('div', { class: 'chips' }, btns));
  }

  const activeTab = TAB_MEMORY;
  function renderTabs(s, idx) {
    const bar = h('div', { class: 'tabbar' });
    const panes = [];
    const show = (i) => {
      activeTab[idx] = i;
      [...bar.children].forEach((b, j) => b.classList.toggle('on', j === i));
      panes.forEach((p, j) => { p.hidden = j !== i; });
    };
    s.tabs.forEach((tab, i) => {
      const grid = h('div', { class: 'grid', style: `--cols:${tab.cols || 2}` });
      for (const f of tab.fields || []) {
        const fn = RENDER[f.type];
        if (!fn) throw new Error(`Поле «${f.id || f.label}»: невідомий тип «${f.type}»`);
        if (!f.hidden) grid.append(fn(f));
      }
      panes.push(h('div', { class: 'tab-pane' }, grid));
      bar.append(h('button', { type: 'button', class: 'tab', text: tab.title, onclick: () => show(i) }));
    });
    const wrap = h('div', { class: 'tabs' }, bar, ...panes);
    show(activeTab[idx] || 0);
    return wrap;
  }

  const RENDER = {
    ability: renderAbility, chips: renderChips,
    text: renderText, longtext: renderLongText, number: renderNumber, checkbox: renderCheckbox,
    select: renderSelect, computed: renderComputed, stat: renderStat, counter: renderCounter,
    track: renderTrack, note: renderNote, roll: renderRoll, list: renderList, slots: renderSlots,
  };

  const frag = document.createDocumentFragment();
  let split = null;
  const sectionNode = (s, idx) => {
    let inner;
    if (s.tabs) {
      inner = renderTabs(s, idx);
    } else {
      inner = h('div', { class: `grid ${s.class || ''}`, style: `--cols:${s.cols || 4}` });
      for (const f of s.fields || []) {
        const fn = RENDER[f.type];
        if (!fn) throw new Error(`Поле «${f.id || f.label}»: невідомий тип «${f.type}»`);
        if (f.hidden) continue;
        inner.append(fn(f));
      }
    }
    return h('section', { class: `card ${s.cardClass || ''}`, style: s.order ? `order:${s.order}` : null }, s.title ? h('h2', { text: s.title }) : null, inner);
  };
  // ---------- сторінки (вкладки верхнього рівня) ----------
  const pages = [];
  const pageOf = (title) => {
    let p = pages.find((x) => x.title === title);
    if (!p) { p = { title, el: h('div', { class: 'page' }), split: null }; pages.push(p); }
    return p;
  };
  (template.sections || []).forEach((s, idx) => {
    const p = pageOf(s.page || '');
    if (s.column) {
      if (!p.split) {
        const cols = (template.pageColumns && template.pageColumns[p.title]) || template.columns || ['1fr', '1fr'];
        p.split = { el: h('div', { class: 'split', style: `grid-template-columns:${cols.join(' ')}` }), cols: {} };
        cols.forEach((_, i) => { p.split.cols[i] = h('div', { class: 'split-col' }); p.split.el.append(p.split.cols[i]); });
        p.el.append(p.split.el);
      }
      p.split.cols[Number(s.column) - 1].append(sectionNode(s, idx));
    } else {
      p.split = null;
      p.el.append(sectionNode(s, idx));
    }
  });
  if (pages.length > 1) {
    const key = template.id;
    const bar = h('div', { class: 'pagebar' });
    const show = (i) => {
      PAGE_MEMORY[key] = i;
      [...bar.children].forEach((b2, j) => b2.classList.toggle('on', j === i));
      pages.forEach((p, j) => { p.el.hidden = j !== i; });
    };
    pages.forEach((p, i) => bar.append(h('button', { type: 'button', class: 'pagetab', text: p.title, onclick: () => { show(i); root.closest('.main')?.scrollTo(0, 0); } })));
    frag.append(bar);
    pages.forEach((p) => frag.append(p.el));
    show(Math.min(PAGE_MEMORY[key] || 0, pages.length - 1));
  } else {
    pages.forEach((p) => frag.append(p.el));
  }
  root.dataset.theme = template.theme || '';
  root.replaceChildren(frag);
  refresh();
  return { get, refresh, roll: doRoll, destroy() { root.replaceChildren(); } };
}
