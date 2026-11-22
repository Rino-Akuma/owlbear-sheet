import { t } from './i18n.js';
import { initOwlbear, SIZES, setWindowSize, applySize, resizeWindow, currentSize, makeDiceProvider, announceRoll, dicePlusReady, inOwlbear, obrActive, pickSelectedToken, pickAssetImage, selectedTokenImage, syncHpBar, syncStatusBadge, removeHpBar, publishSummary, isGM, watchTable, sendCmd, myId, getRoomChar, setRoomChar, getCombat, setCombat, watchCombat, sendTurn, focusToken, notify } from './owlbear.js';
import { setProvider, rollPool, describeGroup, keptVals } from './engine/dice.js';
import { TEMPLATES, getTemplate } from './templates/index.js';
import { mountSheet, fmt } from './engine/sheet.js';
import { buildSummary } from './summary.js';
import { mountGm } from './gm.js';
import { openBestiary } from './bestiary.js';
import { mountNpc, npcSum } from './npc.js';
import { buildOrder, startState, reconcile, keyOf, npcSkipped, advance } from './combat.js';
import { mountCombat, renderTurnBar } from './combat-ui.js';
import { COND_META, condColor } from './conditions.js';
import { loadIconPack, iconSvg, getCondMode, setCondMode } from './icons.js';
import {
  listCharacters, saveCharacter, deleteCharacter, newId, requestPersistence,
  makeBackup, readBackup, SCHEMA_VERSION,
} from './storage.js';

const $ = (sel) => document.querySelector(sel);

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---------- модальне вікно (без alert/confirm — у iframe вони можуть бути заблоковані) ----------
function modal({ title, body, buttons }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const close = (val) => { root.replaceChildren(); resolve(val); };
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      title ? h('h3', { text: title }) : null,
      typeof body === 'string' ? h('p', { text: body }) : body,
      h('div', { class: 'modal-actions' }, buttons.map((b) => h('button', {
        type: 'button', class: b.primary ? 'primary' : b.danger ? 'danger' : '', text: b.label, onclick: () => close(b.value),
      }))));
    root.replaceChildren(h('div', { class: 'backdrop', onclick: (e) => { if (e.target.classList.contains('backdrop')) close(null); } }, box));
    box.querySelector('button')?.focus();
  });
}

// ---------- стан ----------
let characters = [];
let active = null;     // поточний запис персонажа
let sheet = null;      // керування намальованим листом
let saveTimer = null;
const logEntries = [];
const opts = { difficulty: 0, bonus: 0, critHi: 95, critLo: 5, adv: 0, vis: 'everyone', extra: '' };
// Кубики з лотка: якщо ввімкнено «Додавати до перевірки», забираємо їх у наступну перевірку з листа.
opts.takeExtra = () => {
  const box = document.getElementById('tr-attach');
  const groups = DICE.filter((d) => tray[d] > 0).map((d) => ({ sides: d, count: tray[d] }));
  const mod = Number(document.getElementById('tr-mod').value) || 0;
  if (!box || !box.checked || (!groups.length && !mod)) return { groups: [], mod: 0 };
  DICE.forEach((d) => { tray[d] = 0; });
  document.getElementById('tr-mod').value = 0;
  drawTray();
  return { groups, mod };
};

const displayName = (c) => (c.data && c.data.name ? c.data.name : t.noName);

// ---------- збереження ----------
function setStatus(text, cls = '') {
  const el = $('#save-status');
  el.textContent = text;
  el.className = `save-status ${cls}`;
}

// ---------- зведення для ГМа ----------
let sumTimer = null;
function publishNow() {
  if (!inOwlbear()) return;
  clearTimeout(sumTimer);
  sumTimer = setTimeout(() => {
    const rc = getRoomChar();
    // ГМ бачить лише персонажа, обраного для цієї кімнати; інші листи гравця не публікуються.
    if (!rc || (!active && !characters.some((c) => c.id === rc))) { publishSummary(null); return; }
    if (!active || active.id !== rc || !sheet) return; // обраний персонаж зараз не відкритий — лишаємо попереднє зведення
    try { publishSummary(buildSummary(active, sheet.get)); } catch (e) { console.warn('Зведення:', e.message); }
  }, 300);
}
function drawRoomBtn() {
  const b = $('#btn-room');
  b.hidden = !inOwlbear() || !active || !!active.npc;
  if (b.hidden) { $('#btn-more').classList.remove('attention'); return; }
  const on = getRoomChar() === active.id;
  b.textContent = on ? '✓ Грає в цій кімнаті' : 'Грати цим персонажем у кімнаті';
  b.classList.toggle('on', on);
  b.classList.toggle('attention', !on && !getRoomChar());
  $('#btn-more').classList.toggle('attention', !on && !getRoomChar());
  b.title = on ? 'ГМ бачить зведення цього персонажа. Натисніть, щоб прибрати' : 'Лише обраний персонаж видимий ГМу в цій кімнаті';
  renderList();
}
function onRoomBtn() {
  if (!active) return;
  if (getRoomChar() === active.id) { setRoomChar(null); publishSummary(null); } else { setRoomChar(active.id); }
  drawRoomBtn();
  publishNow();
}
// ---------- перегляди: меню (home), лист (sheet), меню ГМа (gm) ----------
let view = 'home';
let backTo = 'home';
let baseSize = SIZES.narrow.slice();   // розмір вікна, обраний користувачем
const isNarrow = () => (inOwlbear() ? baseSize[0] <= 900 : window.innerWidth <= 900);
function setView(v) {
  view = v;
  document.querySelector('.app').dataset.view = v;
  $('#btn-back').textContent = backTo === 'gm' ? '← Меню ГМа' : backTo === 'chars' ? '← Персонажі' : '← Меню';
  if (v === 'gm') { mountGmView(); gmTab(gmTabName); }
  closeMore(); closeSize();
  fitWindow();
}
function placeLog() { (isNarrow() ? $('#rolls') : $('#histcol')).append($('#log-block')); }
/** Вузький режим визначає обраний розмір вікна, а не поточна ширина (на старті вікно стискається до меню). */
function layout() {
  document.querySelector('.app').classList.toggle('nm', isNarrow());
  placeLog();
  fitWindow();
}
/** На стартовому меню вікно стискається до меню й кубиків, щоб не було порожнього поля. */
function fitWindow() {
  if (!inOwlbear()) return;
  const dice = !document.querySelector('.app').classList.contains('dice-off');
  const [w, hh] = view === 'home' ? (isNarrow() ? [Math.min(baseSize[0], 400), Math.min(baseSize[1], 600)] : [dice ? 540 : 260, Math.min(baseSize[1], 640)]) : baseSize;
  const c = currentSize();
  if (Math.abs(c[0] - w) > 1 || Math.abs(c[1] - hh) > 1) applySize(w, hh);
}
function setDice(on) {
  document.querySelector('.app').classList.toggle('dice-off', !on);
  try { localStorage.setItem('owlbear-sheet:dice', on ? 'on' : 'off'); } catch { /* ігноруємо */ }
  fitWindow();
}
function toggleDice() {
  if (isNarrow()) { const r = $('#rolls'); r.classList.toggle('open'); $('#strip-arrow').textContent = r.classList.contains('open') ? '▼' : '▲'; return; }
  setDice(document.querySelector('.app').classList.contains('dice-off'));
}
function closeSize() { const m = $('#size-menu'); if (m) m.hidden = true; }
function toggleSize(btn) {
  const m = $('#size-menu');
  if (!m.hidden) { m.hidden = true; return; }
  closeMore();
  m.hidden = false;
  const key = $('#win-size').value;
  m.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === key));
  const r = btn.getBoundingClientRect(), w = m.offsetWidth;
  m.style.top = `${Math.round(r.bottom + 4)}px`;
  m.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)))}px`;
}
function closeMore() { const m = $('#more-menu'); if (m) m.hidden = true; }
function toggleMore() {
  const m = $('#more-menu');
  if (!m.hidden) { m.hidden = true; return; }
  m.hidden = false;
  const r = $('#btn-more').getBoundingClientRect(), w = m.offsetWidth;
  m.style.top = `${Math.round(r.bottom + 4)}px`;
  m.style.left = `${Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)))}px`;
  m.style.maxHeight = `${Math.max(160, window.innerHeight - r.bottom - 16)}px`;
}

// ---------- бій: стан у сцені, смужка ходу ----------
let combat = null;
let gmFlag = false;
let tableRows = [];
let tableReady = false;
let gmMounted = false;
let gmTabName = 'players';
let gmCtl = null, npcCtl = null, combatCtl = null;
const curKey = () => { const e = combat && combat.on ? combat.order[combat.turn] : null; return e ? keyOf(e) : null; };
const npcMapNow = () => new Map(characters.filter((c) => c.npc).map((c) => [c.id, c]));
const skipNow = () => { const m = npcMapNow(); return (e) => e.k === 'n' && npcSkipped(m.get(e.id)); };
function refreshCombatUi() {
  renderTurnBar($('#turnbar'), combat, {
    focus: async (cur) => {
      let tok = cur.tok;
      if (!tok && cur.k === 'n') { const n = characters.find((c) => c.id === cur.id); tok = n && n.tokenId; }
      if (!(await focusToken(tok))) notify('Токен цього учасника не знайдено на столі', 'WARNING');
    },
    gm: gmFlag, myId: myId(),
    endTurn: async (st) => {
      if (gmFlag) await advance(skipNow(), { turn: st.turn, round: st.round });
      else await sendTurn({ type: 'end', turn: st.turn, round: st.round });
    },
  });
  if (gmCtl) gmCtl.refresh();
  if (npcCtl) npcCtl.refresh();
  if (combatCtl) combatCtl.refresh();
}
/** ГМ: підтягує порядок ходів до актуальних ініціатив і HP. */
async function reconcileCombat() {
  if (!gmFlag || !gmMounted || !tableReady || !combat || !combat.on) return;
  const next = reconcile(combat, buildOrder(tableRows, characters.filter((c) => c.npc)));
  if (next) await setCombat(next);
}
const initMod = (rec) => (rec.templateId === 'dnd5e' ? Math.floor(((Number(rec.data.dex) || 10) - 10) / 2) + (Number(rec.data.init_bonus) || 0) : 0);
/** Один кидок пачки d20 на всіх НПС із галочкою «У бою»: кожному по одному числу плюс його модифікатор. */
async function rollNpcInit() {
  const targets = characters.filter((c) => c.npc && c.fight).slice(0, 60);
  if (!targets.length) return;
  const pool = await rollPool([{ sides: 20, count: targets.length }], 0, 'Ініціатива НПС');
  const vals = keptVals(pool.groups[0]);
  const lines = [];
  for (let i = 0; i < targets.length; i++) {
    const rec = targets[i], die = vals[i], mod = initMod(rec), total = die + mod;
    rec.data.init_roll = total;
    rec.sum = { ...(rec.sum || {}), init: total };
    await saveCharacter(rec);
    lines.push(`${rec.data.name || 'НПС'}: ${die}${mod ? ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}` : ''} = ${total}`);
  }
  pushLog({ title: 'Ініціатива НПС', lines, success: null, crit: null, headline: null });
  if (active && active.npc && targets.some((r) => r.id === active.id)) drawSheet();
  refreshNpc();
  await reconcileCombat();
}
function mountGmView() {
  if (gmMounted) return;
  gmMounted = true;
  gmCtl = mountGm($('#gm-players'), {
    onTable: (cb) => watchTable((list) => { tableRows = list; tableReady = true; cb(list); reconcileCombat(); if (combatCtl) combatCtl.refresh(); }),
    setConds: (playerId, charId, conds) => sendCmd({ type: 'conds', to: playerId, charId, conds }),
    setHp: (playerId, charId, op, n, max) => sendCmd({ type: 'hp', to: playerId, charId, op, n, max }),
    clearInit: () => sendCmd({ type: 'clear-init' }),
    current: curKey,
  });
  openNpc();
  combatCtl = mountCombat($('#gm-combat'), {
    state: () => combat,
    rows: () => tableRows,
    npcs: () => characters.filter((c) => c.npc),
    start: async () => {
      const order = buildOrder(tableRows, characters.filter((c) => c.npc));
      if (!order.length) return;
      await setCombat(startState(order, true));
    },
    end: async () => { if (combat) await setCombat({ ...combat, on: false, t: Date.now() }); },
    next: async () => { if (combat) await advance(skipNow(), { turn: combat.turn, round: combat.round }); },
    setRing: async (v) => { if (combat && combat.on) await setCombat({ ...combat, ring: !!v, t: Date.now() }); },
    rollInit: rollNpcInit,
    setInit: async (rec, v) => {
      const n = v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
      rec.data.init_roll = n; rec.sum = { ...(rec.sum || {}), init: n };
      await npcSaved(rec);
      await reconcileCombat();
    },
    setForce: async (rec, v) => { rec.force = !!v; await saveCharacter(rec); await reconcileCombat(); refreshNpc(); },
  });
}
function gmTab(tab) {
  gmTabName = tab;
  document.querySelectorAll('.gm-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  for (const k of ['players', 'npcs', 'combat']) $(`#gm-${k}`).hidden = k !== tab;
  if (tab === 'npcs' && npcCtl) npcCtl.refresh();
  if (tab === 'combat' && combatCtl) combatCtl.refresh();
}

// ---------- смужка HP на токені ----------
async function syncToken() {
  if (!active || !active.tokenId || !sheet) return;
  const hp = Number(sheet.get('hp')) || 0;
  const max = [sheet.get('max_hp'), sheet.get('hp_max')].map(Number).find((v) => v > 0) || 0;
  try {
    if ((await syncHpBar(active.tokenId, hp, max, active.barColor || null, Number(active.data.hp_temp) || 0, !!active.npc)) === 'missing') { active.tokenId = null; await saveCharacter(active); drawTokenBtn(); return; }
    try {
      await syncStatusBadge(active.tokenId, active.data.conditions, undefined, !!active.npc && !!active.hideStatus);
      showCondErr('');
    } catch (e) { console.warn('Стани на токені:', e); showCondErr(`Стани на токені: ${(e && (e.message || (e.error && e.error.message))) || JSON.stringify(e)}`); }
  } catch (e) { console.warn('Смужка HP:', e.message); }
}
async function drawLegend() {
  const d = $('#cond-legend');
  if (!d) return;
  d.hidden = !(obrActive() && active && active.tokenId);
  const body = $('#cond-legend-body');
  if (d.hidden || body.dataset.ready) return;
  body.dataset.ready = '1';
  const pack = await loadIconPack();
  body.replaceChildren(...Object.keys(COND_META).map((n) => {
    const svg = iconSvg(pack, n);
    const row = document.createElement('span');
    row.className = 'legend-item';
    row.innerHTML = svg ? svg : `<i class="legend-dot" style="background:${condColor(n)}"></i>`;
    row.append(document.createTextNode(n));
    return row;
  }), Object.assign(document.createElement('div'), { className: 'legend-credit', textContent: 'Іконки: game-icons.net та їхні автори, ліцензія CC BY 3.0.' }));
}
function showCondErr(text) {
  const el = $('#cond-err');
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
}
function drawCondMode() {
  const b = $('#btn-condmode');
  if (!b) return;
  b.hidden = !(obrActive() && active && active.tokenId);
  b.textContent = getCondMode() === 'icons' ? 'Стани: лише іконки' : 'Стани: іконка + слово';
  b.title = 'Як показувати стани над токеном. Натисніть, щоб перемкнути';
}
function onCondMode() {
  setCondMode(getCondMode() === 'icons' ? 'both' : 'icons');
  drawCondMode();
  syncToken();
}
/** Для НПС тримаємо в записі кеш HP/КБ, щоб меню НПС працювало без відкритого листа. */
function updateNpcSum() {
  if (!active || !sheet) return;
  try { const s = buildSummary(active, sheet.get); active.sum = { hp: s.hp, max: s.max, tmp: s.tmp, init: s.init, ac: s.ac }; } catch { /* лишаємо попередній кеш */ }
}
function drawTokenBtn() {
  const b = $('#btn-token');
  b.hidden = !obrActive() || !active;
  const nh = $('#npc-opts'); nh.hidden = !(active && active.npc); if (active && active.npc) $('#npc-hide').checked = !!active.hideStatus;
  const nf = $('#npc-fight-wrap'); nf.hidden = !(active && active.npc); if (active && active.npc) $('#npc-fight').checked = !!active.fight;
  const aw = $('#asset-wrap'); aw.hidden = !(obrActive() && active && !active.npc);
  if (!aw.hidden) { $('#asset-info').textContent = active.asset ? `«${active.asset.name || 'є'}»` : ''; $('#btn-asset-clear').hidden = !active.asset; }
  drawLegend();
  drawCondMode();
  if (b.hidden) { $('#bar-color-wrap').hidden = true; return; }
  $('#bar-color-wrap').hidden = !active.tokenId;
  $('#bar-color').value = active.barColor || '#3fae5a';
  $('#bar-auto').classList.toggle('on', !active.barColor);
  b.textContent = active.tokenId ? 'Токен: прив’язано ✕' : 'Прив’язати до токена';
  b.title = active.tokenId ? 'Прибрати смужку HP з токена' : 'Спершу виділіть токен на карті, потім натисніть';
}
async function onToken() {
  if (!active) return;
  if (active.tokenId) {
    await removeHpBar(active.tokenId);
    active.tokenId = null;
  } else {
    const r = await pickSelectedToken();
    if (!r.ok) { setStatus('Спершу виділіть токен на карті', 'err'); return; }
    active.tokenId = r.id;
  }
  await saveCharacter(active);
  drawTokenBtn();
  syncToken();
  publishNow();
}

function scheduleSave() {
  if (!active) return;
  setStatus(t.saving, 'busy');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
  renderList();
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!active) return;
  try {
    updateNpcSum();
    await saveCharacter(active);
    setStatus(`✓ ${t.saved}`, 'ok');
    syncToken();
    publishNow();
    if (active.npc && npcCtl) npcCtl.refresh();
  } catch {
    setStatus(t.saveError, 'err');
  }
}

// ---------- список ----------
function renderList() {
  const ul = $('#char-list');
  ul.replaceChildren();
  const mine = characters.filter((c) => !c.npc);
  for (const c of mine) {
    const tpl = getTemplate(c.templateId);
    const sub = [tpl ? tpl.name : c.templateId, c.data?.race, c.data?.level !== undefined ? `рів. ${c.data.level}` : null]
      .filter(Boolean).join(' · ');
    const room = inOwlbear() && getRoomChar() === c.id;
    ul.append(h('section', { class: `gm-card ${active && active.id === c.id ? 'cur-turn' : ''}` },
      h('div', { class: 'gm-head' },
        h('div', { class: 'gm-who' }, h('strong', { text: `${room ? '★ ' : ''}${displayName(c)}` }), h('small', { class: 'muted', text: sub })),
        h('button', { type: 'button', class: 'primary', text: 'Відкрити лист', onclick: () => openCharacter(c.id) }))));
  }
  $('#empty').hidden = mine.length > 0;
  $('#btn-dup').disabled = $('#btn-del').disabled = $('#btn-export').disabled = !active;
  $('#btn-export-all').disabled = characters.length === 0;
}

async function openCharacter(id, show = true) {
  await flushSave();
  const c = characters.find((x) => x.id === id);
  active = c || null;
  localStorage.setItem('owlbear-sheet:active', id);
  drawSheet();
  renderList();
  if (show) { if (!active || !active.npc) backTo = 'chars'; setView('sheet'); }
}

function drawSheet() {
  const area = $('#sheet');
  sheet?.destroy();
  sheet = null;
  $('#roll-groups').replaceChildren();
  if (!active) {
    area.replaceChildren();
    $('#welcome').hidden = false;
    $('#sheet-bar').hidden = true;
    publishNow();
    return;
  }
  $('#welcome').hidden = true;
  $('#sheet-bar').hidden = false;
  const tpl = getTemplate(active.templateId);
  if (!tpl) {
    area.replaceChildren(h('p', { class: 'error', text: t.unknownTemplate(active.templateId) }));
    return;
  }
  $('#sheet-system').textContent = tpl.name;
  // Додавання кубиків до перевірки працює лише з d20 (D&D); у Континенті d100 — приховуємо галочку.
  const attLabel = document.querySelector('.tray-attach');
  if (attLabel) attLabel.hidden = tpl.id === 'kontynent';
  drawTray();
  try {
    sheet = mountSheet(area, tpl, active.data, { onChange: scheduleSave, getOpts: () => opts, log: pushLog, redraw: drawSheet });
  } catch (e) {
    area.replaceChildren(h('p', { class: 'error', text: `${t.templateError}: ${e.message}` }));
    return;
  }
  applyRollOptions(tpl);
  drawRollGroups(tpl);
  drawTokenBtn();
  drawRoomBtn();
  updateNpcSum();
  syncToken();
  publishNow();
}

function applyRollOptions(tpl) {
  const d20 = tpl.rollOptions === 'd20';
  document.querySelectorAll('.d20-only').forEach((el) => { el.hidden = !d20; });
  document.querySelectorAll('.d100-only').forEach((el) => { el.hidden = d20; });
  if (!d20) { opts.adv = 0; setAdv(0); }
  $('#opts-hint').textContent = d20 ? '' : t.optionsHint;
}

function drawRollGroups(tpl) {
  const box = $('#roll-groups');
  box.replaceChildren();
  for (const g of tpl.rolls || []) {
    box.append(h('div', { class: 'roll-group' },
      h('div', { class: 'lbl', text: g.group }),
      h('div', { class: 'roll-buttons' }, g.items.map((it) => h('button', {
        type: 'button', class: 'roll-btn', text: it.label, onclick: () => sheet && sheet.roll(it),
      })))));
  }
}

// ---------- журнал кидків ----------
function pushLog(entry) {
  logEntries.unshift(entry);
  announceRoll(entry, opts.vis);
  const sl = $('#strip-last');
  if (sl) sl.textContent = entry.headline !== undefined && entry.headline !== null ? `${entry.title}: ${fmt(entry.headline)}` : entry.title;
  if (logEntries.length > 30) logEntries.pop();
  renderLog();
}

function renderLog() {
  const box = $('#log');
  box.replaceChildren();
  if (!logEntries.length) { box.append(h('p', { class: 'muted', text: t.logEmpty })); return; }
  for (const e of logEntries) {
    const badge = e.crit === 'success' ? t.critSuccess : e.crit === 'fail' ? t.critFail
      : e.success === true ? t.success : e.success === false ? t.fail : null;
    const kind = e.crit === 'success' ? 'good' : e.crit === 'fail' ? 'bad'
      : e.success === true ? 'good' : e.success === false ? 'bad' : '';
    box.append(h('div', { class: 'log-entry' },
      h('div', { class: 'log-head' }, h('b', { text: e.title }),
        e.headline !== undefined && e.headline !== null ? h('span', { class: 'log-num', text: fmt(e.headline) }) : null),
      e.lines.map((l) => h('div', { class: 'log-line', text: l })),
      badge ? h('span', { class: `badge ${kind}`, text: badge }) : null,
      e.crit && e.success !== null && e.success !== undefined
        ? h('span', { class: `badge ${e.success ? 'good' : 'bad'}`, text: e.success ? t.success : t.fail }) : null));
  }
}

// ---------- дії над персонажами ----------
async function createCharacter(templateId) {
  const tpl = getTemplate(templateId);
  const c = { id: newId(), templateId, templateVersion: tpl.version, schemaVersion: SCHEMA_VERSION, data: {} };
  await saveCharacter(c);
  characters.unshift(c);
  await openCharacter(c.id);
}

/** Створює НПС (з бестіарію або порожнього) і відкриває його лист. */
async function createNpc(templateId, data) {
  const tpl = getTemplate(templateId);
  const c = { id: newId(), templateId, templateVersion: tpl.version, schemaVersion: SCHEMA_VERSION, data: data || { name: 'НПС' }, npc: true };
  await saveCharacter(c);
  characters.unshift(c);
  backTo = 'gm';
  await openCharacter(c.id);
  refreshNpc();
}
async function createManualNpc() {
  let tid = TEMPLATES[0].id;
  if (TEMPLATES.length > 1) {
    const sel = h('select', {}, TEMPLATES.map((x) => h('option', { value: x.id, text: x.name })));
    const val = await modal({ title: 'Нова НПС: система', body: sel, buttons: [{ label: t.cancel, value: null }, { label: t.create, value: 'ok', primary: true }] });
    if (!val) return;
    tid = sel.value;
  }
  await createNpc(tid);
}

// ---------- меню НПС (ГМ) ----------
const npcRecs = () => characters.filter((c) => c.npc);
const refreshNpc = () => { if (npcCtl) npcCtl.refresh(); if (combatCtl) combatCtl.refresh(); };
async function syncRec(rec) {
  if (!rec.tokenId) return;
  const s = npcSum(rec);
  try {
    if ((await syncHpBar(rec.tokenId, s.hp, s.max, rec.barColor || null, s.tmp, true)) === 'missing') { rec.tokenId = null; await saveCharacter(rec); return; }
    await syncStatusBadge(rec.tokenId, rec.data.conditions, undefined, !!rec.hideStatus);
  } catch (e) { console.warn('Токен НПС:', e); }
}
async function npcSaved(rec) {
  await saveCharacter(rec);
  if (active && active.id === rec.id) drawSheet(); // лист оновиться з нових даних
  await syncRec(rec);
  refreshNpc();
}
const bcOut = 'BroadcastChannel' in window ? new BroadcastChannel('owlbear-sheet') : null;
async function api_setAsset(rec, a) { rec.asset = a; await saveCharacter(rec); if (a && bcOut) bcOut.postMessage({ type: 'asset', id: rec.id }); refreshNpc(); setStatus(`Зображення прив’язано: ${a.name || 'без назви'}`, ''); }
function openNpc() {
  npcCtl = mountNpc($('#gm-npcs'), {
    current: curKey,
    setFight: async (rec, v) => { rec.fight = !!v; await saveCharacter(rec); refreshNpc(); await reconcileCombat(); },
    list: npcRecs,
    sysName: (rec) => { const tp = getTemplate(rec.templateId); return tp ? tp.name : rec.templateId; },
    createManual: createManualNpc,
    openBestiary: () => openBestiary(createNpc),
    openSheet: async (rec) => { backTo = 'gm'; await openCharacter(rec.id); },
    setHp: async (rec, hp, tmp) => { rec.data.hp = hp; if (rec.templateId === 'dnd5e') rec.data.hp_temp = tmp; rec.sum = { ...(rec.sum || {}), ...npcSum({ ...rec, data: rec.data, sum: rec.sum }), hp, tmp }; await npcSaved(rec); },
    setConds: async (rec, conds) => { rec.data.conditions = conds; await npcSaved(rec); },
    setHideStatus: async (rec, v) => { rec.hideStatus = !!v; await npcSaved(rec); },
    toggleToken: async (rec) => {
      if (rec.tokenId) { await removeHpBar(rec.tokenId); rec.tokenId = null; await saveCharacter(rec); refreshNpc(); return; }
      const r = await pickSelectedToken();
      if (!r.ok) { setStatus('Спершу виділіть токен на карті', 'err'); return; }
      const other = characters.find((c) => c.tokenId === r.id && c.id !== rec.id);
      if (other) { setStatus(`Цей токен уже прив’язаний до «${displayName(other)}»`, 'err'); return; }
      rec.tokenId = r.id; await npcSaved(rec);
    },
    setAsset: async (rec, a) => { rec.asset = a; await saveCharacter(rec); refreshNpc(); },
    pickAsset: async (rec) => {
      const r = await pickAssetImage();
      if (!r.ok) { if (r.reason !== 'cancel') setStatus(`Не вдалося відкрити бібліотеку${r.message ? `: ${r.message}` : ''}. Спробуйте «Зображення з токена»`, 'err'); return; }
      await api_setAsset(rec, { url: r.url, name: r.name });
    },
    assetFromToken: async (rec) => {
      const r = await selectedTokenImage();
      if (!r.ok) { setStatus('Спершу виділіть токен на карті', 'err'); return; }
      await api_setAsset(rec, { url: r.url, name: r.name });
    },
    duplicate: async (rec) => {
      const n = await askCount('Скільки копій створити?');
      if (!n) return;
      const base = displayName(rec).replace(/\s+\d+$/, '');
      for (let i = 0; i < n; i++) {
        const copy = JSON.parse(JSON.stringify(rec));
        copy.id = newId(); copy.tokenId = null; copy.asset = null;
        copy.data.name = `${base} ${i + 2}`;
        await saveCharacter(copy); characters.unshift(copy);
      }
      renderList(); refreshNpc();
    },
    remove: async (rec) => {
      const ok = await modal({ title: t.remove, body: t.removeQuestion(displayName(rec)), buttons: [{ label: t.cancel, value: false }, { label: t.remove, value: true, danger: true }] });
      if (!ok) return;
      if (rec.tokenId) { try { await removeHpBar(rec.tokenId); } catch { /* токен міг зникнути */ } }
      await deleteCharacter(rec.id);
      characters = characters.filter((c) => c.id !== rec.id);
      if (active && active.id === rec.id) { active = null; drawSheet(); }
      renderList(); refreshNpc();
    },
  });
}
async function askCount(title) {
  const inp = h('input', { type: 'number', min: '1', max: '20', value: '1' });
  const val = await modal({ title, body: inp, buttons: [{ label: t.cancel, value: null }, { label: 'Створити', value: 'ok', primary: true }] });
  return val ? Math.max(1, Math.min(20, Math.floor(Number(inp.value) || 1))) : 0;
}

async function onNew() {
  if (TEMPLATES.length === 1) return createCharacter(TEMPLATES[0].id);
  const sel = h('select', {}, TEMPLATES.map((x) => h('option', { value: x.id, text: x.name })));
  const val = await modal({
    title: t.chooseSystem, body: sel,
    buttons: [{ label: t.cancel, value: null }, { label: t.create, value: 'ok', primary: true }],
  });
  if (val) await createCharacter(sel.value);
}

async function onDuplicate() {
  if (!active) return;
  await flushSave();
  const copy = JSON.parse(JSON.stringify(active));
  copy.id = newId();
  copy.tokenId = null; copy.asset = null; // копія не має ділити токен з оригіналом
  copy.data.name = `${displayName(active)} ${t.copySuffix}`;
  await saveCharacter(copy);
  characters.unshift(copy);
  await openCharacter(copy.id);
}

async function onDelete() {
  if (!active) return;
  const ok = await modal({
    title: t.remove, body: t.removeQuestion(displayName(active)),
    buttons: [{ label: t.cancel, value: false }, { label: t.remove, value: true, danger: true }],
  });
  if (!ok) return;
  clearTimeout(saveTimer);
  const id = active.id;
  if (active.tokenId) { try { await removeHpBar(active.tokenId); } catch { /* токен міг зникнути */ } }
  if (getRoomChar() === id) setRoomChar(null);
  await deleteCharacter(id);
  characters = characters.filter((c) => c.id !== id);
  active = null;
  const nextC = characters.find((c) => !c.npc);
  if (nextC) await openCharacter(nextC.id, false);
  else { drawSheet(); renderList(); }
  backTo = 'home';
  setView('chars');
}

function download(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'character';

async function onExportOne() {
  if (!active) return;
  await flushSave();
  download(`${safeName(displayName(active))}.json`, makeBackup([active]));
}

async function onExportAll() {
  await flushSave();
  download('owlbear-sheet-backup.json', makeBackup(characters));
}

async function onImportFile(file) {
  if (!file) return;
  let incoming;
  try {
    incoming = readBackup(await file.text());
  } catch {
    await modal({ title: t.importTitle, body: t.importBadFile, buttons: [{ label: t.close, value: true, primary: true }] });
    return;
  }
  const ids = new Set(characters.map((c) => c.id));
  const conflicts = incoming.filter((c) => ids.has(c.id)).length;
  let mode = 'copy';
  if (conflicts) {
    mode = await modal({
      title: t.importTitle, body: t.importConflict(conflicts),
      buttons: [
        { label: t.cancel, value: null },
        { label: t.importCopy, value: 'copy' },
        { label: t.importReplace, value: 'replace', danger: true },
      ],
    });
    if (!mode) return;
  }
  let added = 0;
  for (const src of incoming) {
    const c = JSON.parse(JSON.stringify(src));
    if (ids.has(c.id)) {
      if (mode === 'replace') {
        characters = characters.filter((x) => x.id !== c.id);
      } else {
        c.id = newId();
      }
    }
    await saveCharacter(c);
    characters.unshift(c);
    added++;
  }
  if (active && !characters.includes(active)) active = characters.find((c) => c.id === active.id) || null;
  renderList();
  if (active) drawSheet();
  await modal({ title: t.importTitle, body: t.importDone(added), buttons: [{ label: t.close, value: true, primary: true }] });
}

// ---------- запуск ----------
function bindStaticText() {
  document.title = t.appTitle;
  $('#app-title').textContent = t.appTitle;
  $('#btn-chars').textContent = t.characters;
  $('#chars-tab').textContent = t.characters;
  $('#btn-new').textContent = `+ ${t.newCharacter}`;
  $('#btn-dup').textContent = t.duplicate;
  $('#btn-del').textContent = t.remove;
  $('#btn-export').textContent = t.exportOne;
  $('#btn-export-all').textContent = t.exportAll;
  $('#btn-import').textContent = t.importFile;
  $('#empty-text').textContent = t.noCharacters;
  $('#btn-first').textContent = t.createFirst;
  $('#rolls-title').textContent = t.rolls;
  $('#lbl-diff').firstChild.textContent = t.difficulty;
  const sb = document.querySelectorAll('#seg-adv button');
  sb[0].textContent = 'Недолік'; sb[1].textContent = 'Звичайно'; sb[2].textContent = 'Перевага';
  $('#lbl-bonus').firstChild.textContent = t.extraBonus;
  $('#lbl-crit-hi').firstChild.textContent = t.critFrom;
  $('#lbl-crit-lo').firstChild.textContent = t.critTo;
  $('#btn-clear-log').textContent = t.clearLog;
  $('#opts-hint').textContent = t.optionsHint;
}

function setAdv(v) {
  opts.adv = v;
  document.querySelectorAll('#seg-adv button').forEach((b) => b.classList.toggle('on', Number(b.dataset.adv) === v));
}

// Лоток кубиків у стилі Dice+: тап по кубику — додає його в кидок.
const DIE_SHAPES = {
  4: '12,3 22,21 2,21', 6: '4,4 20,4 20,20 4,20', 8: '12,2 21,12 12,22 3,12',
  10: '12,2 21,10 17,22 7,22 3,10', 12: '12,2 21,9 18,21 6,21 3,9', 20: '12,2 21,7 21,17 12,22 3,17 3,7',
};
const DICE = [4, 6, 8, 10, 12, 20, 100];
const tray = {}; // sides → count
function drawTray() {
  const pool = $('#tray-pool');
  const sides = DICE.filter((d) => tray[d] > 0);
  pool.replaceChildren();
  if (!sides.length) { pool.append(Object.assign(document.createElement('span'), { className: 'muted small', textContent: 'Натисніть на кубик, щоб додати' })); }
  for (const d of sides) {
    const c = document.createElement('button');
    c.type = 'button'; c.className = 'pool-chip'; c.title = 'Натисніть, щоб прибрати один';
    c.textContent = `${tray[d]}д${d}  ✕`;
    c.addEventListener('click', () => { tray[d] -= 1; drawTray(); });
    pool.append(c);
  }
  $('#tr-go').disabled = !sides.length;
  const att = document.getElementById('tr-attach');
  if (att && sides.length) pool.append(Object.assign(document.createElement('span'), { className: 'muted small', textContent: att.checked && !att.closest('label').hidden ? '→ додадуться до наступної перевірки' : '' }));
}
function buildTray() {
  const box = $('#tray-dice');
  for (const d of DICE) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'die-btn'; b.title = `д${d}`;
    const shape = d === 100 ? '<circle cx="12" cy="12" r="10"/>' : `<polygon points="${DIE_SHAPES[d]}"/>`;
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${shape}</svg><span>д${d}</span>`;
    b.addEventListener('click', () => { tray[d] = Math.min(20, (tray[d] || 0) + 1); drawTray(); });
    box.append(b);
  }
  const mod = $('#tr-mod');
  $('#tr-attach').addEventListener('change', drawTray);
  $('#tr-minus').addEventListener('click', () => { mod.value = (Number(mod.value) || 0) - 1; });
  $('#tr-plus').addEventListener('click', () => { mod.value = (Number(mod.value) || 0) + 1; });
  $('#tr-clear').addEventListener('click', () => { DICE.forEach((d) => { tray[d] = 0; }); mod.value = 0; drawTray(); });
  $('#tr-go').addEventListener('click', async () => {
    const groups = DICE.filter((d) => tray[d] > 0).map((d) => ({ sides: d, count: tray[d] }));
    if (!groups.length) return;
    const m = Number(mod.value) || 0;
    // З перевагою/недоліком: одиночний d20 перетворюється на 2d20 (kh1/kl1), як у Dice+.
    const g20 = groups.find((g) => g.sides === 20);
    if (opts.adv && g20 && g20.count === 1) { g20.count = 2; g20.keep = opts.adv > 0 ? 'kh1' : 'kl1'; }
    const pool = await rollPool(groups, m);
    const title = pool.notation;
    const lines = pool.groups.map((g) => describeGroup(g).replace(/^\+/, ''));
    if (m) lines.push(fmt(m, 'signed'));
    pushLog({ title, lines: [`${lines.join(' · ')} = ${pool.total}`], success: null, crit: null, headline: pool.total });
  });
  drawTray();
}

function bindOpts() {
  buildTray();
  document.querySelectorAll('#seg-adv button').forEach((b) => b.addEventListener('click', () => setAdv(Number(b.dataset.adv))));
  $('#in-vis').addEventListener('change', (e) => { opts.vis = e.target.value; });
  const map = { '#in-diff': 'difficulty', '#in-bonus': 'bonus', '#in-crit-hi': 'critHi', '#in-crit-lo': 'critLo' };
  for (const [sel, key] of Object.entries(map)) {
    const el = $(sel);
    el.value = opts[key];
    el.addEventListener('input', () => { opts[key] = Number(el.value) || 0; });
  }
}

async function init() {
  bindStaticText();
  bindOpts();
  $('#btn-new').addEventListener('click', onNew);
  $('#btn-token').addEventListener('click', onToken);
  $('#btn-condmode').addEventListener('click', onCondMode);
  $('#btn-room').addEventListener('click', onRoomBtn);
  $('#btn-gm').addEventListener('click', () => { backTo = 'home'; setView('gm'); });
  $('#btn-back').addEventListener('click', () => { const to = backTo; backTo = 'home'; setView(to === 'gm' && gmFlag ? 'gm' : to === 'chars' ? 'chars' : 'home'); });
  $('#btn-gm-back').addEventListener('click', () => { backTo = 'home'; setView('home'); });
  document.querySelectorAll('.gm-tab').forEach((b) => b.addEventListener('click', () => gmTab(b.dataset.tab)));
  document.querySelectorAll('.dice-toggle').forEach((b) => b.addEventListener('click', toggleDice));
  $('#btn-dice-close').addEventListener('click', () => setDice(false));
  $('#btn-more').addEventListener('click', (e) => { e.stopPropagation(); toggleMore(); });
  window.addEventListener('resize', () => { closeMore(); if (!inOwlbear()) layout(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.more-wrap')) closeMore(); });
  $('#more-menu').addEventListener('click', (e) => { if (e.target.closest('#btn-export, #btn-dup, #btn-del')) closeMore(); });
  $('#npc-fight').addEventListener('change', async (e) => { if (!active || !active.npc) return; active.fight = e.target.checked; await saveCharacter(active); refreshNpc(); reconcileCombat(); });
  $('#btn-chars').addEventListener('click', () => setView('chars'));
  $('#btn-chars-back').addEventListener('click', () => { backTo = 'home'; setView('home'); });
  try { if (localStorage.getItem('owlbear-sheet:dice') === 'off') document.querySelector('.app').classList.add('dice-off'); } catch { /* ігноруємо */ }
  $('#npc-hide').addEventListener('change', async (e) => { if (!active || !active.npc) return; active.hideStatus = e.target.checked; await saveCharacter(active); syncToken(); refreshNpc(); });
  // Фонова сторінка змінила лист (стани/ініціатива від ГМа) — підтягуємо зміни у відкритий лист.
  if ('BroadcastChannel' in window) {
    new BroadcastChannel('owlbear-sheet').onmessage = async (ev) => {
      if (!ev.data || ev.data.type !== 'reload') return;
      if (ev.data.list) {
        // у фоні з’явилися нові листи (копії НПС на столі) — підтягуємо список
        const fresh = await listCharacters();
        if (active) { const st = fresh.find((c) => c.id === active.id); if (st) { active.tokenId = st.tokenId || null; active.asset = st.asset || null; } }
        characters = fresh.map((c) => (active && c.id === active.id ? active : c));
        renderList(); refreshNpc(); drawTokenBtn(); syncToken(); publishNow(); await reconcileCombat();
        return;
      }
      if (!active) return;
      const rec = (await listCharacters()).find((c) => c.id === active.id);
      if (!rec) return;
      active.data.conditions = rec.data.conditions || [];
      active.data.init_roll = rec.data.init_roll ?? null;
      drawSheet();
    };
  }
  $('#bar-color').addEventListener('input', async (e) => { if (!active) return; active.barColor = e.target.value; $('#bar-auto').classList.remove('on'); await saveCharacter(active); syncToken(); });
  $('#bar-auto').addEventListener('click', async () => { if (!active) return; active.barColor = null; $('#bar-auto').classList.add('on'); await saveCharacter(active); syncToken(); });
  const setPlayerAsset = async (a) => {
    if (!active || active.npc) return;
    active.asset = a; await saveCharacter(active); drawTokenBtn();
    if (a && bcOut) bcOut.postMessage({ type: 'asset', id: active.id });
    setStatus(a ? `Зображення прив’язано: ${a.name || 'без назви'}` : 'Зображення відв’язано', '');
  };
  $('#btn-asset-lib').addEventListener('click', async () => {
    const r = await pickAssetImage();
    if (!r.ok) { if (r.reason !== 'cancel') setStatus('Не вдалося відкрити бібліотеку. Спробуйте «З токена»', 'err'); return; }
    await setPlayerAsset({ url: r.url, name: r.name });
  });
  $('#btn-asset-tok').addEventListener('click', async () => {
    const r = await selectedTokenImage();
    if (!r.ok) { setStatus('Спершу виділіть токен на карті', 'err'); return; }
    await setPlayerAsset({ url: r.url, name: r.name });
  });
  $('#btn-asset-clear').addEventListener('click', () => setPlayerAsset(null));
  $('#btn-first').addEventListener('click', onNew);
  $('#btn-dup').addEventListener('click', onDuplicate);
  $('#btn-del').addEventListener('click', onDelete);
  $('#btn-export').addEventListener('click', onExportOne);
  $('#btn-export-all').addEventListener('click', onExportAll);
  $('#btn-import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    await onImportFile(f);
  });
  $('#btn-clear-log').addEventListener('click', () => { logEntries.length = 0; renderLog(); });
  window.addEventListener('pagehide', () => { if (saveTimer) flushSave(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) flushSave(); });

  // меню та шторка кидків (вузький режим)
  $('#rolls-strip').addEventListener('click', () => {
    const r = $('#rolls'); r.classList.toggle('open');
    $('#strip-arrow').textContent = r.classList.contains('open') ? '▼' : '▲';
  });
  // Інтерфейс Owlbear вмикаємо одразу, не чекаючи SDK: виклики самі дочекаються готовності.
  const hideObr = () => { $('#lbl-vis').hidden = true; $('#win-wrap').hidden = true; document.querySelectorAll('.win-ctl').forEach((e) => { e.hidden = true; }); };
  initOwlbear().then((ok) => { if (!ok && inOwlbear()) hideObr(); else if (ok) { syncToken(); drawRoomBtn(); publishNow(); isGM().then((gm) => { gmFlag = gm; $('#btn-gm').hidden = !gm; refreshCombatUi(); }); watchCombat((st) => { combat = st; refreshCombatUi(); }); } });
  if (inOwlbear()) {
    $('#lbl-vis').hidden = false;
    drawTokenBtn(); syncToken();
    setProvider(makeDiceProvider(() => opts.vis));
    const sel = $('#win-size');
    $('#win-wrap').hidden = false;
    let saved = 'narrow';
    try { saved = localStorage.getItem('owlbear-sheet:win') || 'narrow'; } catch { /* ігноруємо */ }
    sel.value = saved;
    sel.addEventListener('change', () => { if (sel.value === 'custom') return; try { localStorage.setItem('owlbear-sheet:win', sel.value); } catch { /* ігноруємо */ } baseSize = (SIZES[sel.value] || SIZES.narrow).slice(); layout(); });
    let custom = null;
    try { custom = JSON.parse(localStorage.getItem('owlbear-sheet:wh') || 'null'); } catch { /* ігноруємо */ }
    const remember = (wh) => { try { localStorage.setItem('owlbear-sheet:wh', JSON.stringify(wh)); localStorage.setItem('owlbear-sheet:win', 'custom'); } catch { /* ігноруємо */ } };
    document.querySelectorAll('.win-ctl').forEach((e) => { e.hidden = false; });
    document.querySelectorAll('.btn-size').forEach((b) => { b.hidden = false; b.addEventListener('click', (e) => { e.stopPropagation(); toggleSize(b); }); });
    document.querySelectorAll('#size-menu [data-size]').forEach((b) => b.addEventListener('click', () => { sel.value = b.dataset.size; sel.dispatchEvent(new Event('change')); closeSize(); }));
    document.addEventListener('click', (e) => { if (!e.target.closest('#size-menu')) closeSize(); });
    document.querySelectorAll('.win-grow').forEach((b) => b.addEventListener('click', async () => { baseSize = await resizeWindow(1.12); remember(baseSize); sel.value = 'custom'; layout(); }));
    document.querySelectorAll('.win-shrink').forEach((b) => b.addEventListener('click', async () => { baseSize = await resizeWindow(1 / 1.12); remember(baseSize); sel.value = 'custom'; layout(); }));
    if (saved === 'custom' && Array.isArray(custom)) { sel.value = 'custom'; baseSize = [custom[0], custom[1]]; } else baseSize = (SIZES[saved === 'custom' ? 'narrow' : saved] || SIZES.narrow).slice();
  }

  layout();
  requestPersistence();
  characters = await listCharacters();
  const last = localStorage.getItem('owlbear-sheet:active');
  const first = characters.find((c) => c.id === last) || characters[0];
  active = first || null;
  renderList();
  drawSheet();
  renderLog();
}

init();
