// «Що дає» раса / клас / передісторія / риса: показуємо список, гравець підтверджує,
// а надане помічається джерелом, щоб його можна було забрати одним кліком при зміні вибору.
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

// ---------- зміни з можливістю відкату (повертають запис «undo») ----------
export function gSkill(ctx, id) {
  if (Number(ctx.data[id]) >= 1) return null;
  ctx.data[id] = 1;
  return { type: 'skill', id };
}
export function gChips(ctx, field, vals) {
  const cur = Array.isArray(ctx.data[field]) ? ctx.data[field] : [];
  const add = vals.filter((v) => !cur.includes(v));
  if (!add.length) return null;
  ctx.data[field] = [...cur, ...add];
  return { type: 'chips', field, vals: add };
}
export function gLine(ctx, prefix, vals) {
  const lines = String(ctx.data.other_prof || '').split('\n').filter((l) => l && !l.startsWith(`${prefix}:`));
  if (vals && vals.length) lines.push(`${prefix}: ${vals.join(', ')}`);
  ctx.data.other_prof = lines.join('\n');
  return { type: 'line', prefix };
}
export function gAppend(ctx, field, line) {
  ctx.appendLine(field, line);
  return { type: 'append', field, line };
}
export function gRows(ctx, list, rows, src) {
  if (!rows.length) return null;
  rows.forEach((r) => ctx.addRow(list, { ...r, src }));
  return { type: 'row', list, src };
}
export function gSet(ctx, id, val) {
  const prev = ctx.data[id];
  ctx.data[id] = val;
  return { type: 'set', id, prev: prev === undefined ? null : prev };
}

function undoOne(ctx, u, src) {
  const d = ctx.data;
  if (u.type === 'skill') d[u.id] = 0;
  else if (u.type === 'chips') d[u.field] = (Array.isArray(d[u.field]) ? d[u.field] : []).filter((v) => !u.vals.includes(v));
  else if (u.type === 'line') d.other_prof = String(d.other_prof || '').split('\n').filter((l) => l && !l.startsWith(`${u.prefix}:`)).join('\n');
  else if (u.type === 'append') { const ls = String(d[u.field] || '').split('\n'); const i = ls.indexOf(u.line); if (i >= 0) ls.splice(i, 1); d[u.field] = ls.join('\n'); }
  else if (u.type === 'row') d[u.list] = (Array.isArray(d[u.list]) ? d[u.list] : []).filter((r) => r.src !== (u.src || src));
  else if (u.type === 'set') d[u.id] = u.prev;
}

/** Забирає все, що було надано цим джерелом (src), крім ручних правок. Повертає кількість відкатів. */
export function revertGrants(ctx, src) {
  const all = Array.isArray(ctx.data.grants) ? ctx.data.grants : [];
  const mine = all.filter((g) => g.src === src);
  mine.forEach((g) => (g.undo || []).forEach((u) => undoOne(ctx, u, src)));
  ctx.data.grants = all.filter((g) => g.src !== src);
  return mine.length;
}
export const grantedBy = (ctx, src) => (Array.isArray(ctx.data.grants) ? ctx.data.grants : []).filter((g) => g.src === src);

// ---------- вікно підтвердження ----------
export function grantsDialog({ title, intro, items }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const close = (v) => { root.replaceChildren(); resolve(v); };
    const on = new Map(items.map((i) => [i.id, i.checked !== false]));
    const picks = new Map(items.filter((i) => i.choose).map((i) => [i.id, new Set()]));
    const groups = [...new Set(items.map((i) => i.group || ''))];
    const body = h('div', { class: 'grants' });
    const confirm = h('button', { type: 'button', class: 'primary', text: 'Додати вибране', onclick: () => close({ ids: new Set([...on].filter(([, v]) => v).map(([k]) => k)), picks: Object.fromEntries([...picks].map(([k, v]) => [k, [...v]])) }) });
    const sync = () => {
      const bad = items.some((i) => i.choose && on.get(i.id) && picks.get(i.id).size !== Math.min(i.choose.count, i.choose.options.length));
      confirm.disabled = bad;
      confirm.title = bad ? 'Оберіть потрібну кількість у відмічених пунктах з вибором' : '';
    };
    for (const g of groups) {
      if (g) body.append(h('h4', { text: g }));
      for (const it of items.filter((x) => (x.group || '') === g)) {
        const cb = h('input', { type: 'checkbox', checked: on.get(it.id) });
        const chips = it.choose ? h('div', { class: 'chips' }, it.choose.options.map((o) => {
          const b = h('button', { type: 'button', class: 'chip-btn', text: o.label });
          b.addEventListener('click', () => {
            const s = picks.get(it.id);
            if (s.has(o.value)) s.delete(o.value); else if (s.size < it.choose.count) s.add(o.value);
            chips.querySelectorAll('button').forEach((bb, i) => bb.classList.toggle('on', s.has(it.choose.options[i].value)));
            sync();
          });
          return b;
        })) : null;
        cb.addEventListener('change', () => { on.set(it.id, cb.checked); if (chips) chips.hidden = !cb.checked; sync(); });
        if (chips) chips.hidden = !cb.checked;
        body.append(h('label', { class: 'grant-row' }, cb, h('span', {}, h('b', { text: it.label }), it.text ? h('span', { class: 'muted small', text: ` — ${it.text}` }) : null)));
        if (chips) body.append(chips);
      }
    }
    if (!items.length) body.append(h('p', { class: 'muted', text: 'Цей пункт нічого автоматично не додає.' }));
    root.replaceChildren(h('div', { class: 'backdrop' }, h('div', { class: 'modal wide', role: 'dialog' },
      h('h3', { text: title }), intro ? h('div', { class: 'muted small', text: intro }) : null, body,
      h('div', { class: 'modal-actions' }, h('button', { type: 'button', text: 'Нічого не додавати', onclick: () => close(null) }), confirm))));
    sync();
  });
}

/** Показує діалог і застосовує вибране. items[i].apply(ctx, picks) → масив undo-записів. */
export async function runGrants(ctx, { src, title, intro, items }) {
  const res = await grantsDialog({ title, intro, items });
  if (!res) return false;
  revertGrants(ctx, src);
  const log = Array.isArray(ctx.data.grants) ? ctx.data.grants : [];
  for (const it of items) {
    if (!res.ids.has(it.id)) continue;
    const undo = (await it.apply(ctx, res.picks[it.id] || [])) || [];
    log.push({ src, label: it.label, undo: [].concat(undo).filter(Boolean) });
  }
  ctx.data.grants = log;
  ctx.touch();
  ctx.redraw();
  return true;
}
