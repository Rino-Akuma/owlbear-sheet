// Панель ГМа: зведення персонажів гравців (HP, КБ, ініціатива, стани, зброя/закляття/риси/володіння).
import { CONDITIONS, COND_ICONS } from './conditions.js';
const ico = (c) => `${COND_ICONS[String(c).replace(/'/g, '’')] || ''} ${c}`.trim();

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const hpColor = (r) => (r > 0.5 ? '#3fae5a' : r > 0.25 ? '#e0b030' : '#d04a3a');
const open = new Set();      // розгорнуті картки (за id гравця)
const palette = new Set();   // картки з відкритою палітрою станів

/**
 * api: { onTable(cb) → unsub, setConds(playerId, charId, conds), clearInit() }
 */
export function mountGm(root, api) {
  let rows = [];
  let clearArmed = false;
  let armTimer = null;

  function card(r) {
    const s = r.sum;
    const ratio = s.max > 0 ? Math.max(0, Math.min(1, s.hp / s.max)) : 0;
    const key = r.id;
    const allConds = CONDITIONS[s.sys] || [];
    const conds = Array.isArray(s.conds) ? s.conds : [];
    const toggle = (c) => {
      const next = conds.includes(c) ? conds.filter((x) => x !== c) : [...conds, c];
      s.conds = next; // одразу показуємо, не чекаючи відповіді
      api.setConds(r.id, s.charId, next);
      draw();
    };
    const det = s.det || {};
    return h('section', { class: 'gm-card' },
      h('div', { class: 'gm-head' },
        h('div', { class: 'gm-init', title: 'Ініціатива', text: s.init === null || s.init === undefined ? '—' : String(s.init) }),
        h('div', { class: 'gm-who' },
          h('strong', { text: s.name }),
          h('span', { class: 'muted small', text: [r.name, s.cls].filter(Boolean).join(' · ') })),
        h('div', { class: 'gm-ac', title: s.acLabel || 'КБ' }, h('span', { class: 'gm-ac-n', text: String(s.ac ?? 0) }), h('span', { class: 'gm-ac-l', text: s.acLabel || 'КБ' }))),
      h('div', { class: 'gm-hp' },
        h('div', { class: 'gm-hp-bar' }, h('div', { class: 'gm-hp-fill', style: `width:${Math.round(ratio * 100)}%;background:${hpColor(ratio)}` })),
        h('span', { class: 'gm-hp-txt', text: `${s.hp} / ${s.max}${s.tmp ? ` (+${s.tmp})` : ''}` })),
      s.note ? h('div', { class: 'muted small', text: s.note }) : null,
      h('div', { class: 'gm-conds' },
        ...conds.map((c) => h('button', { type: 'button', class: 'chip-btn on', title: 'Прибрати стан', text: `${ico(c)} ✕`, onclick: () => toggle(c) })),
        h('button', { type: 'button', class: 'chip-btn add', text: palette.has(key) ? 'Сховати' : '＋ Стан', onclick: () => { palette.has(key) ? palette.delete(key) : palette.add(key); draw(); } })),
      palette.has(key) ? h('div', { class: 'gm-pal' }, allConds.map((c) => h('button', { type: 'button', class: `chip-btn ${conds.includes(c) ? 'on' : ''}`, text: ico(c), onclick: () => toggle(c) }))) : null,
      h('button', { type: 'button', class: 'gm-more', text: open.has(key) ? '▲ Сховати подробиці' : '▼ Зброя, закляття, риси, володіння', onclick: () => { open.has(key) ? open.delete(key) : open.add(key); draw(); } }),
      open.has(key) ? h('div', { class: 'gm-det' }, Object.entries(det).map(([title, items]) => h('div', { class: 'gm-det-col' },
        h('h4', { text: `${title} (${items.length})` }),
        items.length ? h('ul', {}, items.map((x) => h('li', { text: x }))) : h('span', { class: 'muted small', text: '—' })))) : null);
  }

  function draw() {
    const sorted = [...rows].sort((a, b) => {
      const ai = a.sum.init, bi = b.sum.init;
      if (ai === null || ai === undefined) return (bi === null || bi === undefined) ? a.sum.name.localeCompare(b.sum.name) : 1;
      if (bi === null || bi === undefined) return -1;
      return bi - ai;
    });
    const clearBtn = h('button', {
      type: 'button', class: clearArmed ? 'danger-text' : '', text: clearArmed ? 'Точно очистити?' : 'Очистити ініціативу',
      onclick: () => {
        if (!clearArmed) { clearArmed = true; clearTimeout(armTimer); armTimer = setTimeout(() => { clearArmed = false; draw(); }, 3000); draw(); return; }
        clearArmed = false; api.clearInit();
        rows.forEach((r) => { r.sum.init = null; }); draw();
      },
    });
    root.replaceChildren(
      h('div', { class: 'gm-bar' }, h('h2', { text: 'Меню ГМа' }), h('div', { class: 'grow' }), clearBtn,
        h('button', { type: 'button', text: 'Закрити', onclick: () => api.close() })),
      sorted.length ? h('div', { class: 'gm-list' }, sorted.map(card))
        : h('p', { class: 'muted', text: 'Поки що немає персонажів. Гравці з’являться тут, щойно відкриють свій лист у цій кімнаті.' }));
  }

  const unsubP = api.onTable((list) => { rows = list; draw(); });
  draw();
  return { destroy: async () => { (await unsubP)(); } };
}
