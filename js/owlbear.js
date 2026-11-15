// Зв'язок з Owlbear Rodeo (SDK). Працює лише коли сторінка відкрита всередині Owlbear;
// якщо SDK недоступний — аддон просто працює як звичайна сторінка.
const SDK_URL = 'https://esm.sh/@owlbear-rodeo/sdk@3.1.0';
export const SIZES = { narrow: [580, 780], mid: [900, 800], wide: [1280, 880] };

let OBR = null;

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
