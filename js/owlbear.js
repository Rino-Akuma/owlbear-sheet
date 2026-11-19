// Зв'язок з Owlbear Rodeo (SDK). Працює лише коли сторінка відкрита всередині Owlbear;
// якщо SDK недоступний — аддон просто працює як звичайна сторінка.
export const SDK_URL = 'https://esm.sh/@owlbear-rodeo/sdk@3.1.0';
export const SIZES = { narrow: [580, 780], mid: [900, 800], wide: [1280, 880] };
export const SOURCE = 'rino-akuma.owlbear-sheet';       // ідентифікатор для каналів Dice+
export const CH_ROLL = `${SOURCE}/roll-announce`;       // канал «показати кидок усім»

let OBR = null;
let sdkMod = null;
let readyP = null;
let playerInfo = { id: '', name: 'Гравець' };
let dicePlus = { ready: false, checkedAt: 0 };
let lastDicePlusAt = 0;

export const getObr = () => OBR;
export const inOwlbear = () => window.parent !== window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Два дзеркала SDK: беремо те, що відповість першим; без таймаутів назавжди — лише повтори.
const SDK_URLS = [SDK_URL, 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm'];
async function loadSdk() {
  for (let i = 0; i < 6; i++) {
    try {
      const q = i ? `${SDK_URLS[0].includes('?') ? '&' : '?'}r=${i}` : '';
      return await Promise.any([import(SDK_URLS[0] + q), import(SDK_URLS[1] + (i ? `?r=${i}` : ''))]);
    } catch (e) { await sleep(1000 * (i + 1)); }
  }
  throw new Error('SDK не завантажився');
}

/** Запускає підключення до Owlbear. Повертає проміс, який завершується, коли SDK готовий (false — не в Owlbear/помилка). */
export function initOwlbear() {
  if (readyP) return readyP;
  if (!inOwlbear()) return (readyP = Promise.resolve(false));
  readyP = (async () => {
    try {
      sdkMod = await loadSdk();
      OBR = sdkMod.default || sdkMod.OBR;
      if (!OBR || !OBR.isAvailable) { OBR = null; return false; }
      await new Promise((res) => OBR.onReady(res));
      try { playerInfo = { id: await OBR.player.getId(), name: (await OBR.player.getName()) || 'Гравець' }; } catch { /* ігноруємо */ }
      checkDicePlus();
      return true;
    } catch (e) {
      console.warn('Owlbear SDK недоступний:', e.message);
      return false;
    }
  })();
  return readyP;
}
/** Чекає готовності SDK, але не довше за ms. */
export async function whenReady(ms = 15000) {
  if (OBR) return true;
  if (!readyP) initOwlbear();
  return Promise.race([readyP, sleep(ms).then(() => false)]);
}

const LIM = { w: [420, 1700], h: [480, 1100] };
let cur = SIZES.narrow.slice();
export const currentSize = () => cur.slice();
export async function applySize(w, h) {
  await whenReady();
  cur = [Math.max(LIM.w[0], Math.min(LIM.w[1], Math.round(w))), Math.max(LIM.h[0], Math.min(LIM.h[1], Math.round(h)))];
  if (!OBR) return cur.slice();
  try { await OBR.action.setWidth(cur[0]); await OBR.action.setHeight(cur[1]); } catch (e) { console.warn(e); }
  return cur.slice();
}
export const setWindowSize = (key) => applySize(...(SIZES[key] || SIZES.narrow));
/** Збільшити/зменшити вікно кроком (у відсотках від поточного розміру). */
export const resizeWindow = (factor) => applySize(cur[0] * factor, cur[1] * factor);

// ---------- Dice+ (3D-кубики на столі) ----------
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export async function checkDicePlus(force = false) {
  if (!OBR) return false;
  if (!force && Date.now() - dicePlus.checkedAt < 30000) return dicePlus.ready;
  dicePlus.checkedAt = Date.now();
  const requestId = uid();
  dicePlus.ready = await new Promise((resolve) => {
    let unsub = () => {};
    const done = (v) => { unsub(); clearTimeout(tm); resolve(v); };
    const tm = setTimeout(() => done(false), 2500);
    unsub = OBR.broadcast.onMessage('dice-plus/isReady', (ev) => {
      const d = ev.data || {};
      if (d.requestId === requestId && d.ready === true) done(true);
    });
    OBR.broadcast.sendMessage('dice-plus/isReady', { requestId, timestamp: Date.now() }, { destination: 'ALL' }).catch(() => done(false));
  });
  return dicePlus.ready;
}
export const dicePlusReady = () => dicePlus.ready;

/** Створює джерело кубиків для рушія: просить Dice+ кинути кубики й повертає їхні значення. */
export function makeDiceProvider(getVisibility) {
  const inner = async (notation, groups) => {
    await whenReady(6000);
    if (!OBR || !(await checkDicePlus(true))) throw new Error('Dice+ не знайдено (перевірте, що розширення Dice+ увімкнене й GM дозволив джерело)');
    const rollId = uid();
    const target = getVisibility() || 'everyone';
    const result = await new Promise((resolve, reject) => {
      const unsubs = [];
      const finish = (fn, v) => { unsubs.forEach((u) => u()); clearTimeout(tm); fn(v); };
      const tm = setTimeout(() => finish(reject, new Error('Dice+ не відповів')), 20000);
      unsubs.push(OBR.broadcast.onMessage(`${SOURCE}/roll-result`, (ev) => {
        if (ev.data && ev.data.rollId === rollId) finish(resolve, ev.data);
      }));
      unsubs.push(OBR.broadcast.onMessage(`${SOURCE}/roll-error`, (ev) => {
        if (ev.data && ev.data.rollId === rollId) finish(reject, new Error(ev.data.error || 'помилка Dice+'));
      }));
      OBR.broadcast.sendMessage('dice-plus/roll-request', {
        rollId, playerId: playerInfo.id, playerName: playerInfo.name, rollTarget: target,
        diceNotation: notation, showResults: true, timestamp: Date.now(), source: SOURCE,
      }, { destination: 'ALL' }).catch((e) => finish(reject, e));
    });
    lastDicePlusAt = Date.now();
    return (result.result && result.result.groups || []).flatMap((g) => (g.dice || []).map((d) => ({ sides: Number(String(d.diceType || g.diceType || '').replace(/\D/g, '')) || 0, value: Number(d.value), kept: d.kept !== false })));
  };
  return async (notation, groups) => {
    try { return await inner(notation, groups); }
    catch (e) {
      try { OBR && OBR.notification.show(`Dice+: ${e.message}. Кидаю без 3D-кубиків.`, 'WARNING'); } catch (_) { /* ignore */ }
      throw e;
    }
  };
}

// ---------- показати кидок усім (коли Dice+ не використано) ----------
export async function announceRoll(entry, visibility) {
  if (!OBR || visibility === 'self') return;
  try {
    await OBR.broadcast.sendMessage(CH_ROLL, {
      name: playerInfo.name, vis: visibility || 'everyone',
      title: entry.title, headline: entry.headline ?? null, lines: entry.lines || [],
      success: entry.success ?? null, crit: entry.crit ?? null,
    }, { destination: 'REMOTE' });
  } catch (e) { console.warn(e); }
}

/** Текст сповіщення про кидок (спільний для головної сторінки та фонової). */
export function rollToastText(m) {
  const verdict = m.crit === 'success' ? ' · Критичний успіх' : m.crit === 'fail' ? ' · Критичний провал'
    : m.success === true ? ' · Успіх' : m.success === false ? ' · Провал' : '';
  const num = m.headline !== null && m.headline !== undefined ? ` — ${m.headline}` : '';
  return `${m.name}: ${m.title}${num}${verdict}`;
}

// ---------- смужка HP на токені ----------
const BAR_KEY = `${SOURCE}/hpbar`;
const STATUS_KEY = `${SOURCE}/status`;
export const obrActive = () => inOwlbear();

/** Прив'язує персонажа до виділеного на карті токена. Повертає { ok, id?, reason? }. */
export async function pickSelectedToken() {
  if (!(await whenReady())) return { ok: false, reason: 'no-obr' };
  const sel = (await OBR.player.getSelection()) || [];
  if (!sel.length) return { ok: false, reason: 'no-selection' };
  const items = await OBR.scene.items.getItems(sel);
  const it = items.find((i) => i.type === 'IMAGE') || items[0];
  return it ? { ok: true, id: it.id, name: it.name || it.text?.plainText || '' } : { ok: false, reason: 'no-selection' };
}

export async function removeHpBar(tokenId) {
  if (!OBR || !tokenId) return;
  try {
    const bars = await OBR.scene.items.getItems((i) => (i.metadata[BAR_KEY] && i.metadata[BAR_KEY].token === tokenId) || (i.metadata[STATUS_KEY] && i.metadata[STATUS_KEY].token === tokenId));
    if (bars.length) await OBR.scene.items.deleteItems(bars.map((b) => b.id));
  } catch (e) { console.warn(e); }
}

/** Створює/оновлює смужку HP під токеном. Повертає 'ok' або 'missing' (токен видалено). */
export async function syncHpBar(tokenId, hp, max, fixedColor = null) {
  if (!tokenId || !(await whenReady())) return 'ok';
  const [token] = await OBR.scene.items.getItems([tokenId]);
  if (!token) return 'missing';
  const dpi = await OBR.scene.grid.getDpi();
  const img = token.image || { width: dpi, height: dpi };
  const k = dpi / ((token.grid && token.grid.dpi) || dpi);
  const w = img.width * token.scale.x * k;
  const h = img.height * token.scale.y * k;
  const off = (token.grid && token.grid.offset) || { x: img.width / 2, y: img.height / 2 };
  const left = token.position.x - off.x * token.scale.x * k;
  const top = token.position.y - off.y * token.scale.y * k;
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const bh = Math.max(7, h * 0.1), bw = w * 0.9;
  const bx = left + w * 0.05, by = top + h - bh - Math.max(2, h * 0.03);
  const color = fixedColor || (ratio > 0.5 ? '#3fae5a' : ratio > 0.25 ? '#e0b030' : '#d04a3a');
  const geo = { bg: { x: bx, y: by, w: bw }, fill: { x: bx, y: by, w: Math.max(0.01, bw * ratio) } };

  const existing = await OBR.scene.items.getItems((i) => i.metadata[BAR_KEY] && i.metadata[BAR_KEY].token === tokenId);
  if (existing.length >= 2) {
    await OBR.scene.items.updateItems(existing, (drafts) => {
      for (const d of drafts) {
        const g = geo[d.metadata[BAR_KEY].kind]; if (!g) continue;
        d.position = { x: g.x, y: g.y }; d.width = g.w; d.height = bh;
        if (d.metadata[BAR_KEY].kind === 'fill') d.style.fillColor = color;
      }
    });
    return 'ok';
  }
  if (existing.length) await OBR.scene.items.deleteItems(existing.map((e) => e.id));
  const { buildShape } = sdkMod;
  const mk = (kind, fill, opacity) => buildShape()
    .shapeType('RECTANGLE').width(geo[kind].w).height(bh).position({ x: geo[kind].x, y: geo[kind].y })
    .fillColor(fill).fillOpacity(opacity).strokeColor('#000000').strokeOpacity(kind === 'bg' ? 0.9 : 0).strokeWidth(kind === 'bg' ? 2 : 0)
    .attachedTo(tokenId).layer('ATTACHMENT').locked(true).disableHit(true)
    .name(kind === 'bg' ? 'HP (фон)' : 'HP')
    .metadata({ [BAR_KEY]: { token: tokenId, kind } }).build();
  await OBR.scene.items.addItems([mk('bg', '#1a1a1a', 0.8), mk('fill', color, 1)]);
  return 'ok';
}

// ---------- меню ГМа: зведення гравців і команди ----------
export const SUM_KEY = `${SOURCE}/summary`;
export const CH_CMD = `${SOURCE}/cmd`;
export const myId = () => playerInfo.id;

/** Публікує (або прибирає, якщо null) зведення активного персонажа цього гравця. */
export async function publishSummary(sum) {
  if (!(await whenReady())) return;
  try { await OBR.player.setMetadata({ [SUM_KEY]: sum || undefined }); } catch (e) { console.warn('Зведення:', e.message); }
}
/** Змінює частину вже опублікованого зведення (наприклад, стани, поставлені ГМом). */
export async function patchSummary(patch) {
  if (!(await whenReady())) return;
  try {
    const cur = (await OBR.player.getMetadata())[SUM_KEY];
    if (cur) await OBR.player.setMetadata({ [SUM_KEY]: { ...cur, ...patch } });
  } catch (e) { console.warn(e.message); }
}
export async function isGM() {
  if (!(await whenReady())) return false;
  try { return (await OBR.player.getRole()) === 'GM'; } catch { return false; }
}
async function getTable() {
  const [players, own] = await Promise.all([OBR.party.getPlayers(), OBR.player.getMetadata()]);
  return [
    { id: playerInfo.id, name: playerInfo.name, self: true, color: null, sum: own[SUM_KEY] },
    ...players.map((p) => ({ id: p.id, name: p.name, color: p.color, self: false, sum: p.metadata && p.metadata[SUM_KEY] })),
  ].filter((x) => x.sum);
}
/** Підписка на зміни зведень усіх гравців. Повертає функцію відписки. */
export async function watchTable(cb) {
  if (!(await whenReady())) return () => {};
  const run = () => getTable().then(cb).catch((e) => console.warn(e.message));
  const u1 = OBR.party.onChange(run);
  const u2 = OBR.player.onChange(run);
  run();
  return () => { u1(); u2(); };
}
export async function sendCmd(msg) {
  if (!(await whenReady())) return;
  try { await OBR.broadcast.sendMessage(CH_CMD, msg, { destination: 'ALL' }); } catch (e) { console.warn(e.message); }
}
/** Слухає команди ГМа; обробник викликається лише для повідомлень, надісланих справжнім ГМом. */
export async function onCmd(cb) {
  if (!(await whenReady())) return () => {};
  return OBR.broadcast.onMessage(CH_CMD, async (ev) => {
    try {
      const conn = ev.connectionId;
      let gm = false;
      if (conn && conn === (await OBR.player.getConnectionId())) gm = (await OBR.player.getRole()) === 'GM';
      else gm = (await OBR.party.getPlayers()).some((p) => p.connectionId === conn && p.role === 'GM');
      if (gm && ev.data) cb(ev.data);
    } catch (e) { console.warn(e.message); }
  });
}

// ---------- який персонаж грає саме в цій кімнаті ----------
// Вікно аддона спільне для всіх кімнат, тому гравець явно обирає персонажа для кожної кімнати.
const roomKey = () => `owlbear-sheet:room:${(OBR && OBR.room && OBR.room.id) || 'none'}`;
export function getRoomChar() {
  try { return localStorage.getItem(roomKey()) || null; } catch { return null; }
}
export function setRoomChar(id) {
  try { if (id) localStorage.setItem(roomKey(), id); else localStorage.removeItem(roomKey()); } catch { /* ігноруємо */ }
}

import { textCommands } from './glyphs.js';
import { condColor, condKey } from './conditions.js';
import { loadIconPack, iconCommands, getCondMode } from './icons.js';

// ---------- стани на токені ----------
// Над токеном — темна плашка. Режим «both»: до двох станів «іконка + слово», решта «+N ще».
// Режим «icons»: до чотирьох іконок, решта «+N». Без завантажених іконок — кольорова крапка з літерою.
const MAX_BOTH = 2, MAX_ICONS = 4;

// Текст в Owlbear валідується суворо, а допустимі значення стилю відрізняються між версіями,
// тому пробуємо кілька варіантів від повного до мінімального й запам'ятовуємо перший, що спрацював.
const TEXT_VARIANTS = ['left', 'start', 'min', 'bare'];
const TV_KEY = 'owlbear-sheet:text-variant';
function buildTextItem(common, buildText, sp, variant) {
  const it = common(buildText().plainText(sp.text).position({ x: sp.x, y: sp.y }).name(sp.name)).build();
  it.zIndex = 3;
  it.text.width = Math.ceil(sp.w); it.text.height = Math.ceil(sp.h);
  const base = { fontSize: sp.font, fillColor: sp.color, fillOpacity: 1, strokeWidth: 0 };
  const align = variant === 'start' ? (sp.align === 'LEFT' ? 'START' : sp.align) : sp.align;
  if (variant === 'left' || variant === 'start') Object.assign(it.text.style, base, { fontWeight: 500, textAlign: align, textAlignVertical: 'MIDDLE' });
  else if (variant === 'min') Object.assign(it.text.style, base);
  else Object.assign(it.text.style, { fontSize: sp.font, fillColor: sp.color });
  return it;
}
const errText = (e) => (e && (e.message || (e.error && e.error.message))) || (typeof e === 'string' ? e : JSON.stringify(e));

/** Створює/оновлює плашку станів над токеном (або прибирає). Повертає 'ok' або 'missing'. */
export async function syncStatusBadge(tokenId, conds, modeOverride) {
  if (!tokenId || !(await whenReady())) return 'ok';
  const list = (Array.isArray(conds) ? conds : []).filter(Boolean);
  const existing = await OBR.scene.items.getItems((i) => i.metadata[STATUS_KEY] && i.metadata[STATUS_KEY].token === tokenId);
  if (!list.length) {
    if (existing.length) await OBR.scene.items.deleteItems(existing.map((e) => e.id));
    return 'ok';
  }
  const [token] = await OBR.scene.items.getItems([tokenId]);
  if (!token) return 'missing';
  const mode = modeOverride || getCondMode();
  const dpi = await OBR.scene.grid.getDpi();
  const img = token.image || { width: dpi, height: dpi };
  const k = dpi / ((token.grid && token.grid.dpi) || dpi);
  const w = img.width * token.scale.x * k;
  const off = (token.grid && token.grid.offset) || { x: img.width / 2, y: img.height / 2 };
  const left = token.position.x - off.x * token.scale.x * k;
  const top = token.position.y - off.y * token.scale.y * k;
  const S = Math.round(Math.max(26, Math.min(w * 0.28, 60)));
  const sig = `${mode}|${S}|${list.join(',')}`;
  if (existing.length && existing[0].metadata[STATUS_KEY].sig === sig) return 'ok';

  const pack = await loadIconPack();
  const font = Math.round(S * 0.55), gap = Math.round(S * 0.2), pad = Math.round(S * 0.22);
  const tw = (s) => textCommands(s).width * font / 1000;
  const maxShown = mode === 'icons' ? MAX_ICONS : MAX_BOTH;
  const shown = list.slice(0, maxShown), rest = list.length - shown.length;
  const restText = mode === 'icons' ? `+${rest}` : `+${rest} ще`;
  const restW = rest ? tw(restText) : 0;

  // розкладка (локальні координати від лівого верхнього кута плашки)
  const parts = []; // { kind:'icon'|'text', state?, text?, x, y, w, h }
  let bw, bh;
  if (mode === 'icons') {
    shown.forEach((st, n) => parts.push({ kind: 'icon', state: st, x: pad + n * (S + gap), y: pad, w: S, h: S }));
    const rowW = shown.length * S + (shown.length - 1) * gap;
    if (rest) parts.push({ kind: 'text', text: restText, x: pad + rowW + gap, y: pad + (S - font * 1.3) / 2, w: restW, h: font * 1.3 });
    bw = pad * 2 + rowW + (rest ? gap + restW : 0); bh = pad * 2 + S;
  } else {
    const widths = shown.map((st) => S + gap + tw(st));
    shown.forEach((st, n) => {
      const y = pad + n * (S + gap);
      parts.push({ kind: 'icon', state: st, x: pad, y, w: S, h: S });
      parts.push({ kind: 'text', text: st, x: pad + S + gap, y: y + (S - font * 1.3) / 2, w: tw(st), h: font * 1.3 });
    });
    bw = pad * 2 + Math.max(...widths, rest ? restW : 0);
    bh = pad * 2 + shown.length * S + (shown.length - 1) * gap;
    if (rest) { parts.push({ kind: 'text', text: restText, x: pad, y: bh - pad + gap * 0.4, w: restW, h: font * 1.3, dim: true }); bh += font * 1.3 + gap * 0.4; }
  }
  const bx = left + w / 2 - bw / 2, by = top - bh - Math.round(S * 0.18);

  const { buildShape, buildText, buildPath } = sdkMod;
  const meta = { [STATUS_KEY]: { token: tokenId, sig } };
  const common = (b) => b.attachedTo(tokenId).layer('ATTACHMENT').locked(true).disableHit(true).metadata(meta);
  const makers = [() => { const it = common(buildShape().shapeType('RECTANGLE').width(bw).height(bh).position({ x: bx, y: by })
    .fillColor('#111111').fillOpacity(0.88).strokeColor('#000000').strokeOpacity(0.9).strokeWidth(2).name('Стани (фон)')).build(); it.zIndex = 1; return it; }];
  const glyph = (str, x, y, h, color, name) => { // рядок як векторний контур: x — ліво, y — верх рядка висотою h
    const { cmds } = textCommands(str), sc = font / 1000;
    makers.push(() => { const it = common(buildPath().commands(cmds).fillColor(color).fillOpacity(1).strokeColor(color).strokeOpacity(0).strokeWidth(0)
      .position({ x, y: y + h / 2 + font * 0.365 }).scale({ x: sc, y: sc }).name(name)).build(); it.zIndex = 3; return it; });
  };
  for (const pt of parts) {
    const x = bx + pt.x, y = by + pt.y;
    if (pt.kind === 'text') {
      glyph(pt.text, x, y, pt.h, pt.dim ? '#9a978f' : '#f1efe9', 'Стан (текст)');
    } else {
      const col = condColor(pt.state);
      const cmds = iconCommands(pack, pt.state);
      if (cmds) {
        const sc = pt.w / 512;
        makers.push(() => { const it = common(buildPath().commands(cmds).fillColor(col).fillOpacity(1).strokeColor(col).strokeOpacity(0).strokeWidth(0)
          .position({ x, y }).scale({ x: sc, y: sc }).name(`Стан: ${pt.state}`)).build(); it.zIndex = 2; return it; });
      } else { // без іконки: кольорова плашка з літерою
        makers.push(() => { const it = common(buildShape().shapeType('RECTANGLE').width(pt.w).height(pt.h).position({ x, y }).fillColor(col).fillOpacity(1).strokeWidth(0).name(`Стан: ${pt.state}`)).build(); it.zIndex = 2; return it; });
        glyph(String(pt.state)[0], x + (pt.w - tw(String(pt.state)[0])) / 2, y, pt.h, '#111111', 'Літера');
      }
    }
  }
  const items = [];
  let firstErr = null;
  for (const mk of makers) { try { items.push(mk()); } catch (e) { firstErr = firstErr || e; } }
  // спочатку малюємо нове, лише потім прибираємо старе: якщо щось піде не так, старе не зникне
  await OBR.scene.items.addItems(items);
  if (existing.length) await OBR.scene.items.deleteItems(existing.map((e) => e.id));
  if (firstErr) throw new Error(`частину елементів не вдалося створити (${errText(firstErr)})`);
  return 'ok';
}
