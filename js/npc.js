// Меню НПС для ГМа: усі НПС (вручну або з бестіарію), HP, стани, прив’язка до токенів, дублювання.
import { CONDITIONS } from './conditions.js';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

/** Підсумок HP для НПС: кеш із листа або запасна оцінка з даних. */
export function npcSum(rec) {
  const d = rec.data || {}, s = rec.sum || {};
  const kont = rec.templateId === 'kontynent';
  const max = Number(s.max) || (kont ? (Number(d.con) || 0) * (Number(d.hp_mult) || 2) : Number(d.hp_max) || 0);
  const hp = d.hp === undefined || d.hp === null ? max : Number(d.hp) || 0;
  return { hp, max, tmp: kont ? 0 : Number(d.hp_temp) || 0, init: s.init ?? null, ac: s.ac ?? d.ac ?? d.armor ?? 0 };
}

const hpColor = (r) => (r > 0.5 ? '#3fae5a' : r > 0.25 ? '#e0b030' : '#d0463c');

export function mountNpc(root, api) {
  const amt = new Map(), palette = new Set();
  function draw() {
    const ae = document.activeElement;
    const focusKey = ae && root.contains(ae) && ae.classList && ae.classList.contains('gm-hp-in') ? ae.dataset.k : null;
    const list = api.list();
    root.replaceChildren(
      h('div', { class: 'gm-bar' }, h('h2', { text: 'НПС' }), h('div', { class: 'grow' }),
        h('button', { type: 'button', text: '＋ Вручну', onclick: () => api.createManual() }),
        h('button', { type: 'button', text: '＋ З бестіарію', onclick: () => api.openBestiary() }),
        h('button', { type: 'button', text: 'Закрити', onclick: () => api.close() })),
      list.length ? h('div', { class: 'gm-list' }, list.map(card)) : h('p', { class: 'muted', text: 'НПС ще немає. Створіть вручну або виберіть істоту з бестіарію.' }));
    if (focusKey) { const n = [...root.querySelectorAll('.gm-hp-in')].find((x) => x.dataset.k === focusKey); if (n) n.focus(); }
  }
  function card(rec) {
    const s = npcSum(rec), ratio = s.max > 0 ? Math.max(0, Math.min(1, s.hp / s.max)) : 0;
    const conds = Array.isArray(rec.data.conditions) ? rec.data.conditions : [];
    const all = CONDITIONS[rec.templateId] || [];
    const key = rec.id;
    const hasTemp = rec.templateId === 'dnd5e';
    const hpOp = async (op) => {
      const n = Math.floor(Number(amt.get(key)) || 0);
      if (n <= 0) return;
      let { hp, tmp } = s;
      if (op === 'dmg') { const ab = hasTemp ? Math.min(tmp, n) : 0; tmp -= ab; hp = Math.max(0, hp - (n - ab)); }
      else if (op === 'heal') hp = s.max > 0 ? Math.min(s.max, hp + n) : hp + n;
      else if (op === 'temp' && hasTemp) tmp = Math.max(tmp, n);
      amt.delete(key);
      await api.setHp(rec, hp, tmp);
    };
    const toggle = (c) => api.setConds(rec, conds.includes(c) ? conds.filter((x) => x !== c) : [...conds, c]);
    return h('section', { class: `gm-card ${rec.tokenId ? '' : 'npc-free'}` },
      h('div', { class: 'gm-head' },
        h('div', { class: 'gm-init', title: 'Ініціатива', text: s.init === null || s.init === undefined ? '—' : String(s.init) }),
        h('div', { class: 'gm-who' }, h('strong', { text: rec.data.name || 'НПС' }), h('span', { class: 'muted small', text: api.sysName(rec) })),
        h('div', { class: 'gm-ac', title: 'КБ / обладунок' }, h('span', { class: 'gm-ac-n', text: String(s.ac ?? 0) }))),
      h('div', { class: 'gm-hp' },
        h('div', { class: 'gm-hp-bar' }, h('div', { class: 'gm-hp-fill', style: `width:${Math.round(ratio * 100)}%;background:${hpColor(ratio)}` })),
        h('span', { class: 'gm-hp-txt', text: `${s.hp} / ${s.max}${s.tmp ? ` (+${s.tmp})` : ''}` })),
      h('div', { class: 'gm-hp-edit' },
        h('input', { type: 'number', min: '0', class: 'gm-hp-in', 'data-k': key, placeholder: '0', value: amt.get(key) ?? '', oninput: (e) => amt.set(key, e.target.value), onkeydown: (e) => { if (e.key === 'Enter') hpOp('dmg'); } }),
        h('button', { type: 'button', class: 'chip-btn', text: 'Шкода', onclick: () => hpOp('dmg') }),
        h('button', { type: 'button', class: 'chip-btn', text: 'Лікування', onclick: () => hpOp('heal') }),
        hasTemp ? h('button', { type: 'button', class: 'chip-btn', text: 'Тимч. HP', onclick: () => hpOp('temp') }) : null),
      h('div', { class: 'gm-conds' },
        ...conds.map((c) => h('button', { type: 'button', class: 'chip-btn on', title: 'Прибрати стан', text: `${c} ✕`, onclick: () => toggle(c) })),
        h('button', { type: 'button', class: 'chip-btn add', text: palette.has(key) ? 'Сховати' : '＋ Стан', onclick: () => { palette.has(key) ? palette.delete(key) : palette.add(key); draw(); } })),
      palette.has(key) ? h('div', { class: 'gm-pal' }, all.map((c) => h('button', { type: 'button', class: `chip-btn ${conds.includes(c) ? 'on' : ''}`, text: c, onclick: () => toggle(c) }))) : null,
      h('div', { class: 'npc-actions' },
        h('button', { type: 'button', class: 'chip-btn', text: rec.tokenId ? 'Токен: прив’язано ✕' : 'Прив’язати до токена', title: rec.tokenId ? 'Відв’язати й прибрати смужку' : 'Спершу виділіть токен на карті', onclick: () => api.toggleToken(rec) }),
        h('label', { class: 'npc-hide' }, h('input', { type: 'checkbox', checked: rec.hideStatus ? '' : null, onchange: (e) => api.setHideStatus(rec, e.target.checked) }), ' Стани лише для ГМа'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'chip-btn', text: 'Лист', onclick: () => api.openSheet(rec) }),
        h('button', { type: 'button', class: 'chip-btn', text: 'Дублювати', onclick: () => api.duplicate(rec) }),
        h('button', { type: 'button', class: 'chip-btn danger-text', text: 'Видалити', onclick: () => api.remove(rec) })));
  }
  draw();
  return { refresh: draw, destroy() { root.replaceChildren(); } };
}
