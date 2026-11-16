// Бібліотека правил D&D 5e (2014): дані з js/data/*.json (збирає tools/build-library.py).
import { t } from './i18n.js';

const cache = {};
export function loadLib(kind) {
  if (!cache[kind]) {
    cache[kind] = fetch(new URL(`./data/${kind}.json`, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }
  return cache[kind];
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
}

/**
 * Вікно вибору з бібліотеки. cfg: { title, kind, meta(entry)->рядок, facets:[{label, get(entry)->значення|масив, fmt?}] }
 * Повертає запис або null.
 */
export function pickFromLibrary(cfg) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const close = (v) => { root.replaceChildren(); resolve(v); };
    const search = el('input', { type: 'search', placeholder: t.libSearch });
    const list = el('div', { class: 'lib-list' }, el('p', { class: 'muted', text: t.libLoading }));
    const facetBox = el('div', { class: 'lib-facets' });
    const sel = [];
    const box = el('div', { class: 'modal wide', role: 'dialog' },
      el('h3', { text: cfg.title }), el('div', { class: 'lib-bar' }, search, facetBox), list,
      el('div', { class: 'modal-actions' }, el('button', { type: 'button', text: t.cancel, onclick: () => close(null) })));
    root.replaceChildren(el('div', { class: 'backdrop', onclick: (e) => { if (e.target.classList.contains('backdrop')) close(null); } }, box));
    search.focus();

    loadLib(cfg.kind).then((all) => {
      (cfg.facets || []).forEach((f) => {
        const vals = new Set();
        all.forEach((e) => [].concat(f.get(e) ?? []).forEach((v) => vals.add(v)));
        const s = el('select', {}, el('option', { value: '', text: f.label }),
          [...vals].sort((a, b) => (typeof a === 'number' ? a - b : String(a).localeCompare(String(b)))).map((v) => el('option', { value: String(v), text: f.fmt ? f.fmt(v) : String(v) })));
        s.addEventListener('change', draw);
        sel.push([f, s]);
        facetBox.append(s);
      });
      function draw() {
        const q = search.value.trim().toLowerCase();
        const res = all.filter((e) => (!cfg.filter || cfg.filter(e)) && (!q || e.n.toLowerCase().includes(q))
          && sel.every(([f, s]) => !s.value || [].concat(f.get(e) ?? []).map(String).includes(s.value)));
        if (q) res.sort((x, y) => (y.n.toLowerCase() === q) - (x.n.toLowerCase() === q) || (y.n.toLowerCase().startsWith(q)) - (x.n.toLowerCase().startsWith(q)));
        list.replaceChildren(...res.slice(0, 80).map((e) => el('button', { type: 'button', class: 'lib-item', onclick: () => close(e) },
          el('b', { text: e.n }), el('span', { class: 'muted small', text: ` ${e.s} · ${cfg.meta ? cfg.meta(e) : ''}` }))));
        if (!res.length) list.replaceChildren(el('p', { class: 'muted', text: t.libNothing }));
        else if (res.length > 80) list.append(el('p', { class: 'muted small', text: t.libMore(res.length - 80) }));
      }
      search.addEventListener('input', draw);
      draw();
    }).catch((err) => { list.replaceChildren(el('p', { class: 'error', text: `${t.libError}: ${err.message}` })); });
  });
}

/** Вікно з текстом (опис закляття тощо). cfg: { title, meta, text, onSave? } — якщо є onSave, текст можна редагувати. */
export function showTextModal(cfg) {
  const root = document.getElementById('modal-root');
  const close = () => root.replaceChildren();
  const body = cfg.onSave
    ? el('textarea', { class: 'desc-area', rows: '12', placeholder: t.descEmpty })
    : el('div', { class: 'desc-text', text: cfg.text || t.descEmpty });
  if (cfg.onSave) { body.value = cfg.text || ''; body.addEventListener('input', () => cfg.onSave(body.value)); }
  const extra = (cfg.buttons || []).map((b) => el('button', { type: 'button', class: b.primary ? 'primary' : '', text: b.label, onclick: () => b.onclick() }));
  const box = el('div', { class: 'modal wide', role: 'dialog' },
    el('h3', { text: cfg.title }), cfg.meta ? el('div', { class: 'muted small', text: cfg.meta }) : null, body,
    el('div', { class: 'modal-actions' }, ...extra, el('button', { type: 'button', text: t.close, onclick: close })));
  root.replaceChildren(el('div', { class: 'backdrop', onclick: (e) => { if (e.target.classList.contains('backdrop')) close(); } }, box));
  return close;
}

/** Вибір кількох пунктів зі списку (наприклад, навичок класу). cfg: { title, hint, options:[{value,label}], count } → масив значень або null. */
export function pickMany(cfg) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const close = (v) => { root.replaceChildren(); resolve(v); };
    const chosen = new Set();
    const ok = el('button', { type: 'button', class: 'primary', text: t.confirmPick, onclick: () => close([...chosen]) });
    const info = el('div', { class: 'muted small' });
    const sync = () => {
      info.textContent = t.pickCount(chosen.size, cfg.count);
      ok.disabled = chosen.size !== cfg.count;
      boxes.forEach(([v, b]) => { b.classList.toggle('on', chosen.has(v)); b.disabled = !chosen.has(v) && chosen.size >= cfg.count; });
    };
    const boxes = cfg.options.map((o) => [o.value, el('button', { type: 'button', class: 'chip-btn', text: o.label, onclick: () => { chosen.has(o.value) ? chosen.delete(o.value) : chosen.add(o.value); sync(); } })]);
    const box = el('div', { class: 'modal wide', role: 'dialog' }, el('h3', { text: cfg.title }), cfg.hint ? el('div', { class: 'muted small', text: cfg.hint }) : null, info,
      el('div', { class: 'chips' }, boxes.map(([, b]) => b)),
      el('div', { class: 'modal-actions' }, el('button', { type: 'button', text: t.skip, onclick: () => close(null) }), ok));
    root.replaceChildren(el('div', { class: 'backdrop' }, box));
    sync();
  });
}
