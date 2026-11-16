import { t } from './i18n.js';
import { initOwlbear, setWindowSize, applySize, resizeWindow, currentSize, makeDiceProvider, announceRoll, dicePlusReady, inOwlbear, obrActive, pickSelectedToken, syncHpBar, removeHpBar } from './owlbear.js';
import { setProvider, rollPool, describeGroup } from './engine/dice.js';
import { TEMPLATES, getTemplate } from './templates/index.js';
import { mountSheet, fmt } from './engine/sheet.js';
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

const displayName = (c) => (c.data && c.data.name ? c.data.name : t.noName);

// ---------- збереження ----------
function setStatus(text, cls = '') {
  const el = $('#save-status');
  el.textContent = text;
  el.className = `save-status ${cls}`;
}

// ---------- смужка HP на токені ----------
async function syncToken() {
  if (!active || !active.tokenId || !sheet) return;
  const hp = Number(sheet.get('hp')) || 0;
  const max = [sheet.get('max_hp'), sheet.get('hp_max')].map(Number).find((v) => v > 0) || 0;
  try {
    if ((await syncHpBar(active.tokenId, hp, max)) === 'missing') { active.tokenId = null; await saveCharacter(active); drawTokenBtn(); }
  } catch (e) { console.warn('Смужка HP:', e.message); }
}
function drawTokenBtn() {
  const b = $('#btn-token');
  b.hidden = !obrActive() || !active;
  if (b.hidden) return;
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
    await saveCharacter(active);
    setStatus(`✓ ${t.saved}`, 'ok');
    syncToken();
  } catch {
    setStatus(t.saveError, 'err');
  }
}

// ---------- список ----------
function renderList() {
  const ul = $('#char-list');
  ul.replaceChildren();
  for (const c of characters) {
    const tpl = getTemplate(c.templateId);
    const sub = [tpl ? tpl.name : c.templateId, c.data?.race, c.data?.level !== undefined ? `рів. ${c.data.level}` : null]
      .filter(Boolean).join(' · ');
    ul.append(h('li', {},
      h('button', {
        type: 'button', class: `char ${active && active.id === c.id ? 'on' : ''}`,
        onclick: () => openCharacter(c.id),
      }, h('b', { text: displayName(c) }), h('small', { text: sub }))));
  }
  $('#empty').hidden = characters.length > 0;
  $('#btn-dup').disabled = $('#btn-del').disabled = $('#btn-export').disabled = !active;
  $('#btn-export-all').disabled = characters.length === 0;
}

async function openCharacter(id) {
  await flushSave();
  const c = characters.find((x) => x.id === id);
  active = c || null;
  localStorage.setItem('owlbear-sheet:active', id);
  drawSheet();
  renderList();
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
  try {
    sheet = mountSheet(area, tpl, active.data, { onChange: scheduleSave, getOpts: () => opts, log: pushLog, redraw: drawSheet });
  } catch (e) {
    area.replaceChildren(h('p', { class: 'error', text: `${t.templateError}: ${e.message}` }));
    return;
  }
  applyRollOptions(tpl);
  drawRollGroups(tpl);
  drawTokenBtn();
  syncToken();
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
  await deleteCharacter(id);
  characters = characters.filter((c) => c.id !== id);
  active = null;
  if (characters[0]) await openCharacter(characters[0].id);
  else { drawSheet(); renderList(); }
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
  $('#chars-title').textContent = t.characters;
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
  $('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); document.querySelector('.side').classList.toggle('menu-open'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.side')) document.querySelector('.side').classList.remove('menu-open'); });
  document.querySelector('.side').addEventListener('click', (e) => { if (e.target.closest('.side-foot button, .row2 button')) document.querySelector('.side').classList.remove('menu-open'); });
  $('#rolls-strip').addEventListener('click', () => {
    const r = $('#rolls'); r.classList.toggle('open');
    $('#strip-arrow').textContent = r.classList.contains('open') ? '▼' : '▲';
  });
  // Інтерфейс Owlbear вмикаємо одразу, не чекаючи SDK: виклики самі дочекаються готовності.
  const hideObr = () => { $('#lbl-vis').hidden = true; $('#win-wrap').hidden = true; document.querySelectorAll('.win-ctl').forEach((e) => { e.hidden = true; }); };
  initOwlbear().then((ok) => { if (!ok && inOwlbear()) hideObr(); else if (ok) syncToken(); });
  if (inOwlbear()) {
    $('#lbl-vis').hidden = false;
    drawTokenBtn(); syncToken();
    setProvider(makeDiceProvider(() => opts.vis));
    const sel = $('#win-size');
    $('#win-wrap').hidden = false;
    let saved = 'narrow';
    try { saved = localStorage.getItem('owlbear-sheet:win') || 'narrow'; } catch { /* ігноруємо */ }
    sel.value = saved;
    sel.addEventListener('change', () => { if (sel.value === 'custom') return; try { localStorage.setItem('owlbear-sheet:win', sel.value); } catch { /* ігноруємо */ } setWindowSize(sel.value); });
    let custom = null;
    try { custom = JSON.parse(localStorage.getItem('owlbear-sheet:wh') || 'null'); } catch { /* ігноруємо */ }
    const remember = (wh) => { try { localStorage.setItem('owlbear-sheet:wh', JSON.stringify(wh)); localStorage.setItem('owlbear-sheet:win', 'custom'); } catch { /* ігноруємо */ } };
    document.querySelectorAll('.win-ctl').forEach((e) => { e.hidden = false; });
    document.querySelectorAll('.win-grow').forEach((b) => b.addEventListener('click', async () => { remember(await resizeWindow(1.12)); sel.value = 'custom'; }));
    document.querySelectorAll('.win-shrink').forEach((b) => b.addEventListener('click', async () => { remember(await resizeWindow(1 / 1.12)); sel.value = 'custom'; }));
    if (saved === 'custom' && Array.isArray(custom)) { sel.value = 'custom'; applySize(custom[0], custom[1]); } else setWindowSize(saved === 'custom' ? 'narrow' : saved);
  }

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
