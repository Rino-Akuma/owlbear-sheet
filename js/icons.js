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
export const iconDataUrl = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
