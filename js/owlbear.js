// Зв'язок з Owlbear Rodeo (SDK). Працює лише коли сторінка відкрита всередині Owlbear;
// якщо SDK недоступний — аддон просто працює як звичайна сторінка.
export const SDK_URL = 'https://esm.sh/@owlbear-rodeo/sdk@3.1.0';
export const SIZES = { narrow: [580, 780], mid: [900, 800], wide: [1280, 880] };
export const SOURCE = 'rino-akuma.owlbear-sheet';       // ідентифікатор для каналів Dice+
export const CH_ROLL = `${SOURCE}/roll-announce`;       // канал «показати кидок усім»

let OBR = null;
let playerInfo = { id: '', name: 'Гравець' };
let dicePlus = { ready: false, checkedAt: 0 };
let lastDicePlusAt = 0;

export async function initOwlbear() {
  if (window.parent === window) return false; // не в iframe
  try {
    const mod = await Promise.race([
      import(SDK_URL),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
    OBR = mod.default || mod.OBR;
    if (!OBR || !OBR.isAvailable) return false;
    await new Promise((res) => OBR.onReady(res));
    try { playerInfo = { id: await OBR.player.getId(), name: (await OBR.player.getName()) || 'Гравець' }; } catch { /* ігноруємо */ }
    checkDicePlus();
    return true;
  } catch (e) {
    console.warn('Owlbear SDK недоступний:', e.message);
    return false;
  }
}

const LIM = { w: [420, 1700], h: [480, 1100] };
let cur = SIZES.narrow.slice();
export const currentSize = () => cur.slice();
export async function applySize(w, h) {
  cur = [Math.max(LIM.w[0], Math.min(LIM.w[1], Math.round(w))), Math.max(LIM.h[0], Math.min(LIM.h[1], Math.round(h)))];
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
    const tm = setTimeout(() => done(false), 1000);
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
  if (Date.now() - lastDicePlusAt < 3000) return; // Dice+ уже показав кидок на столі
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
export const obrActive = () => !!OBR;

/** Прив'язує персонажа до виділеного на карті токена. Повертає { ok, id?, reason? }. */
export async function pickSelectedToken() {
  if (!OBR) return { ok: false, reason: 'no-obr' };
  const sel = (await OBR.player.getSelection()) || [];
  if (!sel.length) return { ok: false, reason: 'no-selection' };
  const items = await OBR.scene.items.getItems(sel);
  const it = items.find((i) => i.type === 'IMAGE') || items[0];
  return it ? { ok: true, id: it.id, name: it.name || it.text?.plainText || '' } : { ok: false, reason: 'no-selection' };
}

export async function removeHpBar(tokenId) {
  if (!OBR || !tokenId) return;
  try {
    const bars = await OBR.scene.items.getItems((i) => i.metadata[BAR_KEY] && i.metadata[BAR_KEY].token === tokenId);
    if (bars.length) await OBR.scene.items.deleteItems(bars.map((b) => b.id));
  } catch (e) { console.warn(e); }
}

/** Створює/оновлює смужку HP під токеном. Повертає 'ok' або 'missing' (токен видалено). */
export async function syncHpBar(tokenId, hp, max) {
  if (!OBR || !tokenId) return 'ok';
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
  const color = ratio > 0.5 ? '#3fae5a' : ratio > 0.25 ? '#e0b030' : '#d04a3a';
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
  const { buildShape } = await import(SDK_URL);
  const mk = (kind, fill, opacity) => buildShape()
    .shapeType('RECTANGLE').width(geo[kind].w).height(bh).position({ x: geo[kind].x, y: geo[kind].y })
    .fillColor(fill).fillOpacity(opacity).strokeColor('#000000').strokeOpacity(kind === 'bg' ? 0.9 : 0).strokeWidth(kind === 'bg' ? 2 : 0)
    .attachedTo(tokenId).layer('ATTACHMENT').locked(true).disableHit(true)
    .name(kind === 'bg' ? 'HP (фон)' : 'HP')
    .metadata({ [BAR_KEY]: { token: tokenId, kind } }).build();
  await OBR.scene.items.addItems([mk('bg', '#1a1a1a', 0.8), mk('fill', color, 1)]);
  return 'ok';
}
