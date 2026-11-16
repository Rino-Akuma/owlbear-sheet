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

export async function setWindowSize(key) {
  const [w, h] = SIZES[key] || SIZES.narrow;
  try { await OBR.action.setWidth(w); await OBR.action.setHeight(h); } catch (e) { console.warn(e); }
}

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
  return async (sides, count) => {
    if (!OBR || !(await checkDicePlus())) throw new Error('Dice+ не знайдено');
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
        diceNotation: `${count}d${sides}`, showResults: true, timestamp: Date.now(), source: SOURCE,
      }, { destination: 'ALL' }).catch((e) => finish(reject, e));
    });
    lastDicePlusAt = Date.now();
    const groups = (result.result && result.result.groups) || [];
    return groups.flatMap((g) => (g.dice || []).filter((d) => d.kept !== false).map((d) => Number(d.value)));
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
