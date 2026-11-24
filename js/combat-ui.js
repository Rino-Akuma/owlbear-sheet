// Інтерфейс бою: смужка ходу (для всіх) і вкладка «Бій» у меню ГМа.
import { buildOrder, keyOf } from './combat.js';
import { npcSum } from './npc.js';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

/** Смужка «Хід: …» угорі вікна. api: { gm, myId, endTurn(st) }. */
export function renderTurnBar(el, st, api) {
  if (!st || !st.on || !(st.order || []).length) { el.hidden = true; el.replaceChildren(); return; }
  const cur = st.order[st.turn];
  const mine = cur && cur.k === 'p' && cur.id === api.myId;
  el.hidden = false;
  el.replaceChildren(
    h('span', { class: 'who', text: `Хід: ${cur ? cur.name : '—'}` }),
    h('span', { class: 'muted', text: `Раунд ${st.round}` }),
    h('div', { class: 'turn-order' }, st.order.map((e, i) => h('span', { class: `turn-chip ${i === st.turn ? 'cur' : ''} ${e.skip ? 'skip' : ''} ${e.tok && api.selected && api.selected().has(e.tok) ? 'sel' : ''}`, text: `${e.init === null || e.init === undefined ? '–' : e.init} ${e.name}` }))),
    cur && api.focus ? h('button', { type: 'button', text: '◎ До токена', title: 'Навести камеру на того, чий зараз хід', onclick: () => api.focus(cur) }) : null,
    api.gm || mine ? h('button', { type: 'button', class: 'primary', text: api.gm && !mine ? 'Кінець ходу (за поточного)' : 'Кінець ходу', onclick: () => api.endTurn(st) }) : null);
}

/**
 * Вкладка «Бій» (ГМ). api: { state(), rows(), npcs(), start(), end(), next(), setRing(v), rollInit(), setInit(rec, v), setForce(rec, v) }
 */
export function mountCombat(root, api) {
  const amt = new Map();
  const hpOp = (e, op) => {
    const k = keyOf(e), n = Math.floor(Number(amt.get(k)) || 0);
    if (n <= 0) return;
    amt.delete(k);
    api.hpOp(e, op, n);
  };
  const isSel = (e, rec) => { const sel = api.selected ? api.selected() : null; const t = e.tok || (rec && rec.tokenId); return !!(sel && t && sel.has(t)); };
  function draw() {
    const ae = document.activeElement;
    const focusCls = ae && root.contains(ae) && ae.classList ? (ae.classList.contains('cb-init') ? 'cb-init' : ae.classList.contains('cb-amt') ? 'cb-amt' : null) : null;
    const focusId = focusCls ? ae.dataset.k : null;
    const st = api.state();
    const on = !!(st && st.on);
    const npcMap = new Map(api.npcs().map((n) => [n.id, n]));
    const order = on ? st.order : buildOrder(api.rows(), api.npcs());
    const curKey = on && st.order[st.turn] ? keyOf(st.order[st.turn]) : null;
    const fighters = api.npcs().filter((n) => n.fight);
    root.replaceChildren(
      h('div', { class: 'cb-bar' },
        on ? h('b', { text: `Раунд ${st.round}` }) : h('span', { class: 'muted', text: 'Бій не почато' }),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', text: 'Кинути ініціативу НПС', title: fighters.length ? `Один кидок на ${fighters.length} НПС з галочкою «У бою»` : 'Спершу позначте НПС галочкою «У бою»', disabled: fighters.length ? null : '', onclick: () => api.rollInit() }),
        on ? h('button', { type: 'button', class: 'primary', text: 'Наступний хід', onclick: () => api.next() }) : null,
        on ? h('button', { type: 'button', class: 'danger-text', text: 'Завершити бій', onclick: () => api.end() })
          : h('button', { type: 'button', class: 'primary', text: 'Почати бій', disabled: order.length ? null : '', onclick: () => api.start() }),
        h('label', { class: 'npc-hide' }, h('input', { type: 'checkbox', checked: !on || st.ring !== false ? '' : null, onchange: (e) => api.setRing(e.target.checked) }), ' Кільце на токені')),
      ...(order.length ? order.map((e) => {
        const rec = e.k === 'n' ? npcMap.get(e.id) : null;
        const hs = api.hpInfo(e) || { hp: 0, max: 0, tmp: 0, ac: 0 };
        return h('div', { class: `cb-row ${keyOf(e) === curKey ? 'cur' : ''} ${e.skip ? 'skip' : ''} ${isSel(e, rec) ? 'sel' : ''}` },
          h('div', { class: 'cb-top' },
            h('span', { class: 'cb-mark', text: keyOf(e) === curKey ? '▶' : '' }),
            rec ? h('input', { type: 'number', class: 'cb-init', 'data-k': e.id, value: e.init === null ? '' : e.init, placeholder: '—', title: 'Ініціатива (можна виправити)', onchange: (ev) => api.setInit(rec, ev.target.value) })
              : h('span', { class: 'cb-init', text: e.init === null ? '—' : String(e.init), title: 'Ініціатива гравця береться з його листа' }),
            h('span', { class: 'cb-name', text: e.name }),
            h('span', { class: 'muted small', text: e.k === 'p' ? 'гравець' : 'НПС' }),
            h('span', { class: 'grow' }),
            h('span', { class: 'cb-ac', title: 'Клас броні', text: `КБ ${hs.ac ?? 0}` }),
            h('span', { class: 'cb-hp', text: `HP ${hs.hp}/${hs.max}${hs.tmp ? ` (+${hs.tmp})` : ''}` })),
          h('div', { class: 'cb-bot' },
            h('span', { class: 'cb-hpedit' },
              h('input', { type: 'number', min: '0', class: 'cb-amt', 'data-k': keyOf(e), placeholder: '0', value: amt.get(keyOf(e)) ?? '', oninput: (ev) => amt.set(keyOf(e), ev.target.value), onkeydown: (ev) => { if (ev.key === 'Enter') hpOp(e, 'dmg'); } }),
              h('button', { type: 'button', class: 'chip-btn', text: 'Шкода', onclick: () => hpOp(e, 'dmg') }),
              h('button', { type: 'button', class: 'chip-btn', text: 'Лікув.', onclick: () => hpOp(e, 'heal') })),
            h('span', { class: 'grow' }),
            rec && e.skip ? h('button', { type: 'button', class: 'chip-btn', text: 'Повернути', title: 'Не пропускати, хоч HP 0', onclick: () => api.setForce(rec, true) }) : null,
            rec && rec.force ? h('button', { type: 'button', class: 'chip-btn', text: 'Знову пропускати', onclick: () => api.setForce(rec, false) }) : null,
            rec ? h('button', { type: 'button', class: 'chip-btn', text: 'Лист', title: 'Відкрити лист НПС для редагування', onclick: () => api.openSheet(rec) }) : null));
      }) : [h('p', { class: 'muted', text: 'Тут з’являться гравці та НПС з галочкою «У бою» (вкладка «НПС»).' })]));
    if (focusId) { const n = [...root.querySelectorAll(`.${focusCls}`)].find((x) => x.dataset.k === focusId); if (n) n.focus(); }
  }
  draw();
  return { refresh: draw };
}
