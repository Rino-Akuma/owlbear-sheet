// Іконки станів: game-icons.net (CC BY 3.0). Файли не лежать у репозиторії: лист завантажує набір
// з jsdelivr один раз, вибирає 21 іконку й запам'ятовує в localStorage.
import { COND_META, condKey, condColor } from './conditions.js';

const PACK_URL = 'https://cdn.jsdelivr.net/npm/@iconify-json/game-icons@1/icons.json';
const KEY = 'owlbear-sheet:icons:v1';
const MODE_KEY = 'owlbear-sheet:cond-mode';
let packP = null;

/** Режим відображення станів на токені: 'both' — іконка + слово, 'icons' — лише іконки. */
export function getCondMode() {
  try { return localStorage.getItem(MODE_KEY) === 'icons' ? 'icons' : 'both'; } catch { return 'both'; }
}
export function setCondMode(m) {
  try { localStorage.setItem(MODE_KEY, m === 'icons' ? 'icons' : 'both'); } catch { /* без сховища — лишається типовий */ }
}

/** Повертає { bodies: {стан: svg-вміст 512×512}, names: {стан: назва} } або null, якщо завантажити не вдалося. */
export function loadIconPack() {
  if (packP) return packP;
  packP = (async () => {
    try {
      const c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (c && c.bodies && Object.keys(c.bodies).length >= 15) return c;
    } catch { /* кеш пошкоджено — завантажуємо знову */ }
    const r = await fetch(PACK_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const all = Object.keys(j.icons);
    const bodies = {}, names = {};
    for (const [state, [, pref, kw]] of Object.entries(COND_META)) {
      let n = pref.find((x) => j.icons[x]);
      for (let i = 0; !n && i < kw.length; i++) n = all.filter((x) => x.includes(kw[i])).sort((a, b) => a.length - b.length)[0];
      if (n) { bodies[state] = j.icons[n].body; names[state] = n; }
    }
    const pack = { bodies, names };
    try { localStorage.setItem(KEY, JSON.stringify(pack)); } catch { /* кеш недоступний — не страшно */ }
    return pack;
  })().catch((e) => { console.warn('Іконки станів:', e.message); packP = null; return null; });
  return packP;
}

/** Готовий SVG (рядок) іконки стану потрібного кольору або null. */
export function iconSvg(pack, state, color) {
  const body = pack && pack.bodies[condKey(state)];
  if (!body) return null;
  const col = color || condColor(state);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g fill="${col}">${body.replace(/currentColor/g, col)}</g></svg>`;
}

// ---- SVG-контури → команди Owlbear Path (0 MOVE, 1 LINE, 2 QUAD, 4 CUBIC, 5 CLOSE) ----
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0) return [[1, x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const sq = Math.sqrt(lam); rx *= sq; ry *= sq; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), step = dth / n;
  const t = (4 / 3) * Math.tan(step / 4), out = [];
  const pt = (a) => { const ca = Math.cos(a), sa = Math.sin(a); return [cp * rx * ca - sp * ry * sa + cx, sp * rx * ca + cp * ry * sa + cy]; };
  const dpt = (a) => { const ca = Math.cos(a), sa = Math.sin(a); return [-cp * rx * sa - sp * ry * ca, -sp * rx * sa + cp * ry * ca]; };
  for (let i = 0; i < n; i++) {
    const a1 = th1 + i * step, a2 = a1 + step;
    const p1 = pt(a1), p2 = pt(a2), d1 = dpt(a1), d2 = dpt(a2);
    out.push([4, p1[0] + t * d1[0], p1[1] + t * d1[1], p2[0] - t * d2[0], p2[1] - t * d2[1], i === n - 1 ? x2 : p2[0], i === n - 1 ? y2 : p2[1]]);
  }
  return out;
}

/** Розбирає атрибут d одного <path> у абсолютні команди. */
export function pathToCommands(d) {
  const out = [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', lastC = null, lastQ = null;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => {
    ws();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error('path');
    i += m[0].length; return parseFloat(m[0]);
  };
  const flag = () => { ws(); const c = d[i++]; return c === '1' ? 1 : 0; };
  while (true) {
    ws();
    if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) cmd = d[i++]; else if (!cmd) throw new Error('path');
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    let nc = null, nq = null;
    if (C === 'Z') { out.push([5]); cx = sx; cy = sy; ws(); cmd = 'Z'; if (i < d.length && !/[A-Za-z]/.test(d[i])) throw new Error('path'); }
    else if (C === 'M') { const x = num() + ox, y = num() + oy; out.push([0, x, y]); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { const x = num() + ox, y = num() + oy; out.push([1, x, y]); cx = x; cy = y; }
    else if (C === 'H') { const x = num() + ox; out.push([1, x, cy]); cx = x; }
    else if (C === 'V') { const y = num() + oy; out.push([1, cx, y]); cy = y; }
    else if (C === 'C') { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, x = num() + ox, y = num() + oy; out.push([4, a, b, c, e, x, y]); nc = [c, e]; cx = x; cy = y; }
    else if (C === 'S') { const c = num() + ox, e = num() + oy, x = num() + ox, y = num() + oy; const a = lastC ? 2 * cx - lastC[0] : cx, b = lastC ? 2 * cy - lastC[1] : cy; out.push([4, a, b, c, e, x, y]); nc = [c, e]; cx = x; cy = y; }
    else if (C === 'Q') { const a = num() + ox, b = num() + oy, x = num() + ox, y = num() + oy; out.push([2, a, b, x, y]); nq = [a, b]; cx = x; cy = y; }
    else if (C === 'T') { const x = num() + ox, y = num() + oy; const a = lastQ ? 2 * cx - lastQ[0] : cx, b = lastQ ? 2 * cy - lastQ[1] : cy; out.push([2, a, b, x, y]); nq = [a, b]; cx = x; cy = y; }
    else if (C === 'A') { const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag(), x = num() + ox, y = num() + oy; out.push(...arcToCubics(cx, cy, rx, ry, rot, fa, fs, x, y)); cx = x; cy = y; }
    else throw new Error('path');
    lastC = nc; lastQ = nq;
  }
  return out;
}

/** Команди іконки стану в координатах 512×512 або null. */
export function iconCommands(pack, state) {
  const body = pack && pack.bodies[condKey(state)];
  if (!body) return null;
  try {
    const cmds = [];
    for (const m of body.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)) cmds.push(...pathToCommands(m[1]));
    return cmds.length ? cmds : null;
  } catch (e) { console.warn('Іконка стану:', state, e.message); return null; }
}
