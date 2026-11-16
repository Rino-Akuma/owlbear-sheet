import { t } from './i18n.js';
import { initOwlbear, setWindowSize, applySize, resizeWindow, currentSize, makeDiceProvider, announceRoll, dicePlusReady } from './owlbear.js';
import { setProvider, rollMany, rollExtra } from './engine/dice.js';
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
}

function applyRollOptions(tpl) {
  const d20 = tpl.rollOptions === 'd20';
  document.querySelectorAll('.d20-only').forEach((el) => { el.hidden = !d20; });
  document.querySelectorAll('.d100-only').forEach((el) => { el.hidden = d20; });
  if (!d20) { opts.adv = 0; $('#in-adv').value = '0'; }
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
  $('#lbl-adv').firstChild.textContent = t.advLabel;
  const advOpts = $('#in-adv').options;
  advOpts[0].text = t.advNormal; advOpts[1].text = t.advAdv; advOpts[2].text = t.advDis;
  $('#lbl-bonus').firstChild.textContent = t.extraBonus;
  $('#lbl-crit-hi').firstChild.textContent = t.critFrom;
  $('#lbl-crit-lo').firstChild.textContent = t.critTo;
  $('#btn-clear-log').textContent = t.clearLog;
  $('#opts-hint').textContent = t.optionsHint;
}

function bindOpts() {
  $('#in-adv').addEventListener('change', (e) => { opts.adv = Number(e.target.value) || 0; });
  $('#in-vis').addEventListener('change', (e) => { opts.vis = e.target.value; });
  $('#in-extra').addEventListener('input', (e) => { opts.extra = e.target.value; });
  $('#fr-go').addEventListener('click', async () => {
    const count = Math.max(1, Math.min(20, Number($('#fr-count').value) || 1));
    const sides = Number($('#fr-die').value) || 20;
    const mod = Number($('#fr-mod').value) || 0;
    const rolls = await rollMany(sides, count, { mod: mod + opts.bonus });
    const ex = await rollExtra(opts.extra);
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + mod + opts.bonus + ex.total;
    const modTxt = [mod ? fmt(mod, 'signed') : '', opts.bonus ? fmt(opts.bonus, 'signed') : '', ...ex.parts].filter(Boolean).join(' ');
    pushLog({ title: `${count}д${sides}`, lines: [`[${rolls.join(', ')}]${modTxt ? ` ${modTxt}` : ''} = ${total}`], success: null, crit: null, headline: total });
  });
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
  initOwlbear().then(async (ok) => {
    if (!ok) return;
    $('#lbl-vis').hidden = false;
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
  });

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
