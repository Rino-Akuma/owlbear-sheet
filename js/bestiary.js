// Бестіарій «Континенту» для ГМа: пошук істоти, перегляд характеристик і створення з неї листа NPC.
import { pickFromLibrary, pickMany } from './library.js';

const num = (s) => { const m = String(s || '').match(/\d+/); return m ? Number(m[0]) : 0; };

/** Блок характеристик для перегляду. */
export function statBlock(e) {
  return [
    `Рівень ${e.lvl} · ХП ${e.hp}`,
    `Сила ${e.str} · Спритність ${e.dex} · Статура ${e.con} · Воля ${e.wil}${e.mv ? ` · Маг. витривалість ${e.mv}` : ''}`,
    `Обладунок: ${e.armor || '—'}`,
    `Зброя: ${e.weapon || '—'}`,
    e.traits ? `Риси: ${e.traits}` : null,
  ].filter(Boolean).join('\n');
}

/** Дані листа «Континенту» з запису бестіарію. */
export function npcData(e) {
  const d = { name: e.n, level: e.lvl, str: e.str, dex: e.dex, con: e.con, wil: e.wil, armor: num(e.armor) };
  if (e.con > 0) d.hp_mult = Math.max(1, Math.round(e.hp / e.con));
  if (e.mv) {
    const base = 10 + Math.floor(e.wil / 5);
    if (e.mv >= base) { d.is_mage = true; d.mv_bonus = e.mv - base; } else d.mv_bonus = e.mv;
  }
  if (e.weapon && !/^відсутн/i.test(e.weapon)) d.weapons = [{ name: e.weapon.split(/[,(]/)[0].trim().slice(0, 40), notes: `з бестіарію: ${e.weapon}` }];
  d.effects = [{ name: 'З бестіарію', desc: `Обладунок: ${e.armor || '—'}\nХП за довідником: ${e.hp}` }];
  if (e.traits) d.traits = [{ name: 'Риси', desc: e.traits }];
  return d;
}

export async function openBestiary(createNpc) {
  const e = await pickFromLibrary({ title: 'Бестіарій', kind: 'kont-bestiary', meta: (x) => `рів. ${x.lvl} · ХП ${x.hp}`, facets: [{ label: 'Рівень', get: (x) => x.lvl, fmt: (v) => `Рівень ${v}` }] });
  if (!e) return;
  const pick = await pickMany({ title: e.n, hint: statBlock(e), options: [{ value: 'create', label: 'Створити лист NPC з цієї істоти' }, { value: 'view', label: 'Лише переглянути' }], count: 1 });
  if (pick && pick[0] === 'create') await createNpc(npcData(e));
}
