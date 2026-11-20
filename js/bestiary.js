// Бестіарій «Континенту» для ГМа: пошук істоти, перегляд характеристик і створення з неї листа NPC.
import { pickFromLibrary, pickMany, loadLib, showTextModal } from './library.js';

const SIZES = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
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

/** Дані листа D&D 5e з запису бестіарію D&D та тексту його блока характеристик. */
export function dndNpcData(e, text) {
  const [a, ...rest] = text.split('\n\nTRAITS');
  const body = text.includes('\n\nTRAITS') ? `TRAITS${rest.join('\n\nTRAITS')}` : text.split('\n\n').slice(1).join('\n\n');
  const [str, dex, con, int, wis, cha] = e.ab;
  const d = { name: e.n, str, dex, con, int, wis, cha, ac: e.ac, speed: e.sp || 0, hp_max: e.hp, hp: e.hp };
  d.abilities_notes = `${a.split('\n').slice(3).join('\n')}\n\n${body}`.trim();
  const attacks = [];
  let inActions = false;
  for (const line of text.split('\n')) {
    if (/^[A-Z ]+$/.test(line.trim()) && line.trim()) inActions = line.trim() === 'ACTIONS';
    const m = inActions && line.match(/^(.+?)\. (?:Melee|Ranged)[^:]*Attack: ([+-]\d+) to hit.*?Hit: \d+ \(([^)]+)\) ([a-z]+) damage/);
    if (m) attacks.push({ name: m[1], bonus: Number(m[2]), dmg: `${m[3].replace(/\s/g, '')} ${m[4]}` });
  }
  if (attacks.length) d.attacks = attacks;
  d.notes = [{ title: `${e.n} (${e.s})`, body: `CR ${e.cr} · ${SIZES[e.sz] || e.sz} ${e.ty}` }];
  return d;
}

async function openDnd(createNpc) {
  const e = await pickFromLibrary({ title: 'Бестіарій D&D 5e', kind: 'bestiary', meta: (x) => `CR ${x.cr} · ${x.ty} · КБ ${x.ac} · ХП ${x.hp}`,
    facets: [{ label: 'Тип', get: (x) => x.ty }, { label: 'CR', get: (x) => x.cr, fmt: (v) => `CR ${v}` }, { label: 'Розмір', get: (x) => x.sz }] });
  if (!e) return;
  const pick = await pickMany({ title: `${e.n} (${e.s})`, hint: `CR ${e.cr} · ${SIZES[e.sz] || e.sz} ${e.ty} · КБ ${e.ac} · ХП ${e.hp} · швидкість ${e.sp || 0} фт.`,
    options: [{ value: 'view', label: 'Переглянути блок характеристик' }, { value: 'create', label: 'Створити лист NPC з цієї істоти' }], count: 1 });
  if (!pick) return;
  let text = '';
  try { text = (await loadLib('bestiary-text'))[`${e.n}|${e.s}`] || ''; } catch { /* без повного тексту */ }
  if (pick[0] === 'view') { await showTextModal({ title: `${e.n} (${e.s})`, meta: `CR ${e.cr}`, text: text || 'Опису немає.' }); return; }
  await createNpc('dnd5e', dndNpcData(e, text));
}

async function openKont(createNpc) {
  const e = await pickFromLibrary({ title: 'Бестіарій «Континенту»', kind: 'kont-bestiary', meta: (x) => `рів. ${x.lvl} · ХП ${x.hp}`, facets: [{ label: 'Рівень', get: (x) => x.lvl, fmt: (v) => `Рівень ${v}` }] });
  if (!e) return;
  const pick = await pickMany({ title: e.n, hint: statBlock(e), options: [{ value: 'create', label: 'Створити лист NPC з цієї істоти' }, { value: 'view', label: 'Лише переглянути' }], count: 1 });
  if (pick && pick[0] === 'create') await createNpc('kontynent', npcData(e));
}

export async function openBestiary(createNpc) {
  const sys = await pickMany({ title: 'Бестіарій', hint: 'Яка система?', options: [{ value: 'kont', label: 'Континент' }, { value: 'dnd', label: 'D&D 5e (англійською)' }], count: 1 });
  if (!sys) return;
  if (sys[0] === 'dnd') await openDnd(createNpc); else await openKont(createNpc);
}
