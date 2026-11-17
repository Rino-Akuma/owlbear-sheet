// Шаблон «D&D 5e» (редакція 2014) у стилі Long Story Short. Увесь текст — українською.
import { parseDice, rollDice } from '../engine/dice.js';
import { CONDITIONS } from '../conditions.js';
import { loadLib, pickFromLibrary, pickMany } from '../library.js';
import { runGrants, gSkill, gChips, gLine, gAppend, gRows, gSet } from '../grants.js';
import { openSpellCard, castSpell, rollEffect } from '../spellcard.js';
import { spellFx, effectLabel } from '../spellfx.js';

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

const diceText = (d) => `${d.count}д${d.sides}${d.plus ? sign(d.plus) : ''}`;


// ---------- бібліотека: допоміжне ----------
const ABIL_UA = { str: 'Сил', dex: 'Спр', con: 'Стат', int: 'Інт', wis: 'Мдр', cha: 'Хар' };
const SIZES = { T: 'Крихітний', S: 'Малий', M: 'Середній', L: 'Великий', H: 'Величезний', G: 'Гігантський' };
const SKILL_ID = { 'sleight of hand': 'sleight', 'animal handling': 'animal' };
const DMG_TYPE = { S: 'рубляча', P: 'колюча', B: 'дробна' };
const SCHOOLS = { abjuration: 'захист', conjuration: 'виклик', divination: 'віщування', enchantment: 'зачарування', evocation: 'воплощення', illusion: 'ілюзія', necromancy: 'некромантія', transmutation: 'перетворення' };
const ITEM_TYPES = { M: 'ближній бій', R: 'дальній бій', A: 'боєприпаси', AF: 'боєприпаси', LA: 'легка броня', MA: 'середня броня', HA: 'важка броня', S: 'щит', G: 'спорядження', W: 'чарівний предмет', P: 'зілля', RG: 'каблучка', WD: 'жезл/паличка', RD: 'посох', SC: 'сувій', SCF: 'фокус чаклунства', AT: 'інструменти майстра', T: 'інструменти', GS: 'ігровий набір', INS: 'музичний інструмент', TG: 'товар', '$G': 'коштовність', '$A': 'витвір мистецтва', '$C': 'монети', MNT: 'їздова тварина', TAH: 'упряж', VEH: 'транспорт', SHP: 'корабель', AIR: 'повітряний транспорт', FD: 'їжа', EXP: 'вибухівка', SPC: 'особливе', OTH: 'інше' };
const money = (v) => (v ? `${v / 100} зм` : '');
const dnum = (e) => String(e).replace('d', 'д');
const pbOf = (ctx) => ctx.get('pb');

const SKILL_UA = { acrobatics: 'Акробатика', 'animal handling': 'Догляд за тваринами', arcana: 'Магія', athletics: 'Атлетика', deception: 'Обман', history: 'Історія', insight: 'Проникливість', intimidation: 'Залякування', investigation: 'Аналіз', medicine: 'Медицина', nature: 'Природа', perception: 'Сприйняття', performance: 'Виступ', persuasion: 'Переконання', religion: 'Релігія', 'sleight of hand': 'Спритність рук', stealth: 'Непомітність', survival: 'Виживання' };
const skillId = (k) => SKILL_ID[k] || k;
const cleanTag = (x) => String(x).replace(/\{@\w+ ([^|}]*)(?:\|[^|}]*)*\|([^|}]*)\}/g, '$2').replace(/\{@\w+ ([^|}]*)[^}]*\}/g, '$1');
function giveSkills(ctx, list) { (list || []).forEach((k) => { const id = skillId(k); if (!(Number(ctx.data[id]) >= 1)) ctx.data[id] = 1; }); }
async function chooseSkills(ctx, from, count, title) {
  const opts = from.filter((k) => !(Number(ctx.data[skillId(k)]) >= 1)).map((k) => ({ value: k, label: SKILL_UA[k] || k }));
  const n = Math.min(count, opts.length);
  if (!n) return;
  const picked = await pickMany({ title, hint: 'Відмічені навички отримають володіння (крапку) на вкладці «Характеристики».', options: opts, count: n });
  if (picked) giveSkills(ctx, picked);
}
function addChips(ctx, id, vals) { const cur = Array.isArray(ctx.data[id]) ? ctx.data[id] : []; ctx.data[id] = [...new Set([...cur, ...vals])]; }
/** Рядок виду «Префікс: значення» в полі «Інші володіння та мови»; повторний вибір замінює рядок. */
function setLine(ctx, prefix, vals) {
  const lines = String(ctx.data.other_prof || '').split('\n').filter((l) => l && !l.startsWith(`${prefix}:`));
  if (vals && vals.length) lines.push(`${prefix}: ${vals.join(', ')}`);
  ctx.data.other_prof = lines.join('\n');
}
async function setFeatures(ctx, src, lib, key) {
  const rows = (Array.isArray(ctx.data.features) ? ctx.data.features : []).filter((r) => r.src !== src);
  let list = [];
  try { list = (await loadLib(lib))[key] || []; } catch { /* без опису */ }
  ctx.data.features = [...rows, ...list.map((x) => ({ name: x.n, text: x.t, src }))];
}
const ABIL_SHORT = { 'ІНТ': 'int', 'МДР': 'wis', 'ХАР': 'cha', 'СИЛ': 'str', 'СПР': 'dex', 'СТАТ': 'con' };
/** СЛ і бонус атаки для закляття: власна характеристика рядка або основна. */
function spellStats(ctx, row) {
  const key = ABIL_SHORT[row.abil];
  if (!key) return { dc: ctx.get('spell_dc'), atk: ctx.get('spell_atk') };
  const mod = ctx.get(`${key}_mod`);
  return { dc: 8 + ctx.get('pb') + mod, atk: ctx.get('pb') + mod };
}
const ABIL_NAMES_UA = { str: 'Сила', dex: 'Спритність', con: 'Статура', int: 'Інтелект', wis: 'Мудрість', cha: 'Харизма' };
const SPELL_ABIL = { int: 1, wis: 2, cha: 3, str: 4, dex: 5, con: 6 };

// ---------- «що дає» (раса, клас, передісторія, риси) ----------
const host = (ctx) => ({
  stats: (row) => spellStats(ctx, row),
  level: () => Number(ctx.get('level')) || 1,
  mod: (row) => { const st = spellStats(ctx, row); return st.atk - ctx.get('pb'); },
});
let spellMap = null;
async function findSpell(name) {
  if (!spellMap) {
    spellMap = new Map();
    for (const e of await loadLib('spells')) {
      const k = e.n.toLowerCase();
      if (!spellMap.has(k) || e.s === 'PHB') spellMap.set(k, e);
    }
  }
  return spellMap.get(String(name).toLowerCase()) || null;
}
const TIME_UA = { action: 'дія', bonus: 'бонус. дія', reaction: 'реакція', minute: 'хв', hour: 'год' };
async function spellRow(e, extra = {}) {
  let text = '';
  try { text = (await loadLib('spells-text'))[`${e.n}|${e.s}`] || ''; } catch { /* без опису */ }
  const [num, unit] = String(e.t || '').split(' ');
  return {
    name: e.n, level: e.l, time: `${num} ${TIME_UA[unit] || unit || ''}`.trim(), range: e.r || '', dmg: e.dmg ? dnum(e.dmg) : '',
    up: e.up ? dnum(e.up) : '', cs: e.cs || null, kd: e.kd || '', dt: e.dt || [], sv: e.sv || [], atk: e.atk ? 1 : 0, pm: e.pm ? 1 : 0, k: e.k ? 1 : 0,
    school: SCHOOLS[e.sc] || e.sc, comps: e.c || '', dur: `${e.k ? 'концентрація, ' : ''}${e.d || ''}`, text, ...extra,
  };
}
const LANG_UA = { common: 'Загальна', dwarvish: 'Дварфійська', elvish: 'Ельфійська', giant: 'Велетенська', gnomish: 'Гномська', goblin: 'Гоблінська', halfling: 'Напіврослицька', orc: 'Орочача', abyssal: 'Безодня', celestial: 'Небесна', draconic: 'Драконяча', 'deep speech': 'Глибинна мова', infernal: 'Інфернальна', primordial: 'Первісна', sylvan: 'Сильванська', undercommon: 'Підземна', "thieves' cant": 'Злодійський жаргон', druidic: 'Друїдська' };
const langs = (l) => (l || []).map((x) => LANG_UA[String(x).toLowerCase()] || x);
const skillItems = (e, group, owned) => {
  const out = (e.sk || []).map((k) => ({ id: `sk:${k}`, group, label: SKILL_UA[k] || k, text: 'володіння навичкою', apply: (c) => gSkill(c, skillId(k)) }));
  if (e.skc) {
    const options = Object.keys(SKILL_UA).map((k) => ({ value: k, label: SKILL_UA[k] }));
    out.push({ id: 'skc', group, label: `Оберіть навички (${e.skc})`, choose: { count: e.skc, options: options.filter((o) => !(Number(owned.data[skillId(o.value)]) >= 1)) }, apply: (c, picks) => picks.map((k) => gSkill(c, skillId(k))) });
  }
  return out;
};
async function textItem(src, lib, key, label, group) {
  let list = [];
  try { list = (await loadLib(lib))[key] || []; } catch { /* без опису */ }
  if (!list.length) return [];
  return [{ id: `tx:${src}`, group, label: `${label} (${list.length})`, text: list.map((x) => x.n).join(', '),
    apply: (c) => { c.data.features = (Array.isArray(c.data.features) ? c.data.features : []).filter((r) => r.src !== src); return gRows(c, 'features', list.map((x) => ({ name: x.n, text: x.t })), src); } }];
}
async function featItems(ctx, featName, src, group) {
  const lib = await loadLib('feats');
  const f = lib.find((x) => x.n.toLowerCase() === String(featName).toLowerCase() && x.s !== 'XPHB') || lib.find((x) => x.n.toLowerCase() === String(featName).toLowerCase());
  if (!f) return [];
  let text = '';
  try { text = (await loadLib('feats-text'))[`${f.n}|${f.s}`] || ''; } catch { /* без опису */ }
  const bonus = f.ab ? `Бонус характеристик: ${Object.entries(f.ab).map(([k, v]) => `${ABIL_UA[k] || k} +${v}`).join(', ')}${f.abc ? ' (на вибір)' : ''}\n` : '';
  const items = [{ id: `feat:${f.n}`, group, label: `Риса: ${f.n}`, text: 'з описом', apply: (c) => gRows(c, 'featlist', [{ name: f.n, text: `${bonus}${text}` }], src) }];
  for (const sp of f.sp || []) {
    const e = await findSpell(sp.n);
    if (!e) continue;
    items.push({ id: `fsp:${f.n}:${sp.n}`, group: `Закляття від риси «${f.n}»`, label: e.n, checked: !!sp.a,
      text: `${e.l === 0 ? 'замовляння' : `${e.l}-й рівень`}${sp.i ? ', раз на відпочинок без ячейки' : ''}${sp.a ? '' : ' (за правилами риси оберіть потрібні)'}`,
      apply: async (c) => gRows(c, 'spellbook', [await spellRow(e, { free: sp.i ? 1 : 0, from: f.n })], src) });
  }
  return items;
}

const libActions = {
  async pickRace(ctx, e) {
    const b = Object.entries(e.ab || {}).map(([k, v]) => `${ABIL_UA[k] || k} ${v > 0 ? '+' : ''}${v}`).join(', ');
    ctx.data.race = b ? `${e.n} [${b}]` : e.n;
    const items = [
      { id: 'base', group: 'Основне', label: `Швидкість ${e.sp || 30} фт${SIZES[e.sz] ? `, розмір ${SIZES[e.sz].toLowerCase()}` : ''}`,
        apply: (c) => [gSet(c, 'speed', e.sp || 30), SIZES[e.sz] ? gSet(c, 'size', SIZES[e.sz]) : null] },
      ...skillItems(e, 'Навички', ctx),
    ];
    if (e.ln && e.ln.length) items.push({ id: 'ln', group: 'Мови та інше', label: `Мови: ${langs(e.ln).join(', ')}`, apply: (c) => gLine(c, 'Раса — мови', langs(e.ln)) });
    if (e.tl && e.tl.length) items.push({ id: 'tl', group: 'Мови та інше', label: `Інструменти: ${e.tl.join(', ')}`, apply: (c) => gLine(c, 'Раса — інструменти', e.tl) });
    if (e.dv) items.push({ id: 'dv', group: 'Мови та інше', label: `Темнобачення ${e.dv} фт`, apply: (c) => gLine(c, 'Раса — темнобачення', [`${e.dv} фт`]) });
    items.push(...await textItem('race', 'races-text', `${e.n}|${e.s}`, 'Расові особливості', 'Особливості'));
    await runGrants(ctx, { src: 'race', title: `Раса «${e.n}»: що вона дає`, intro: 'Зніміть позначки з того, що не потрібно. Надане можна замінити, обравши іншу расу.', items });
  },
  async pickClass(ctx, e) {
    const rows = Array.isArray(ctx.data.classes) ? ctx.data.classes : [];
    const first = rows.length === 0;
    ctx.addRow('classes', { name: e.n, sub: '', level: 1, hd: e.hd, sc: e.sc || '' });
    if (e.sc && SPELL_ABIL[e.sc] && !Number(ctx.data.spell_abil)) ctx.data.spell_abil = SPELL_ABIL[e.sc];
    if (!first) return; // мультиклас: володіння не додаються автоматично
    const wp = e.wp || [];
    const items = [
      ...(e.sv || []).map((a) => ({ id: `sv:${a}`, group: 'Рятівні кидки', label: ABIL_NAMES_UA[a] || a, apply: (c) => gSkill(c, `${a}_save`) })),
    ];
    const arm = (e.arm || []).map((x) => ({ light: 'Легка', medium: 'Середня', heavy: 'Важка', shield: 'Щит' })[x]).filter(Boolean);
    if (arm.length) items.push({ id: 'arm', group: 'Володіння', label: `Броня: ${arm.join(', ')}`, apply: (c) => gChips(c, 'armor_prof', arm) });
    const wch = [wp.includes('simple') && 'Проста', wp.includes('martial') && 'Військова', wp.some((x) => x !== 'simple' && x !== 'martial') && 'Інша'].filter(Boolean);
    if (wch.length) items.push({ id: 'wp', group: 'Володіння', label: `Зброя: ${wch.join(', ')}`, apply: (c) => gChips(c, 'weapon_prof', wch) });
    const extraW = wp.filter((x) => x !== 'simple' && x !== 'martial').map(cleanTag);
    if (extraW.length) items.push({ id: 'wl', group: 'Володіння', label: `Окрема зброя: ${extraW.join(', ')}`, apply: (c) => gLine(c, 'Клас — зброя', extraW) });
    if (e.tl && e.tl.length) items.push({ id: 'tl', group: 'Володіння', label: `Інструменти: ${e.tl.join(', ')}`, apply: (c) => gLine(c, 'Клас — інструменти', e.tl) });
    if (e.skc && e.skf) {
      items.push({ id: 'skc', group: 'Навички', label: `Оберіть навички (${e.skc})`,
        choose: { count: e.skc, options: e.skf.filter((k) => !(Number(ctx.data[skillId(k)]) >= 1)).map((k) => ({ value: k, label: SKILL_UA[k] || k })) },
        apply: (c, picks) => picks.map((k) => gSkill(c, skillId(k))) });
    }
    await runGrants(ctx, { src: 'cls', title: `Клас «${e.n}»: що він дає на 1-му рівні`, intro: 'Володіння першого класу. При мультикласі нові володіння додавайте вручну.', items });
  },
  async pickSubclass(ctx, row) {
    const sub = await pickFromLibrary({ title: `Підклас: ${row.name || 'клас'}`, kind: 'subclasses', filter: (x) => !row.name || x.cls.toLowerCase() === String(row.name).toLowerCase(), meta: (x) => (x.sc ? 'магічний' : '') });
    if (!sub) return;
    row.sub = sub.n;
    if (sub.sc && SPELL_ABIL[sub.sc] && !Number(ctx.data.spell_abil)) ctx.data.spell_abil = SPELL_ABIL[sub.sc];
    ctx.touch();
    ctx.redraw();
  },
  async pickBackground(ctx, e) {
    ctx.data.background = e.n;
    const items = [...skillItems(e, 'Навички', ctx)];
    if (e.ln && e.ln.length) items.push({ id: 'ln', group: 'Мови та інструменти', label: `Мови: ${langs(e.ln).join(', ')}`, apply: (c) => gLine(c, 'Передісторія — мови', langs(e.ln)) });
    if (e.tl && e.tl.length) items.push({ id: 'tl', group: 'Мови та інструменти', label: `Інструменти: ${e.tl.join(', ')}`, apply: (c) => gLine(c, 'Передісторія — інструменти', e.tl) });
    for (const ft of e.ft || []) items.push(...await featItems(ctx, ft, 'bg', 'Риса передісторії'));
    items.push(...await textItem('bg', 'backgrounds-text', `${e.n}|${e.s}`, 'Особливість передісторії', 'Особливості'));
    if (e.eq) items.push({ id: 'eq', group: 'Спорядження', label: 'Стартове спорядження', text: e.eq, apply: (c) => gAppend(c, 'equipment', `${e.n}: ${e.eq}`) });
    await runGrants(ctx, { src: 'bg', title: `Передісторія «${e.n}»: що вона дає`, intro: 'Зніміть позначки з того, що не потрібно. Усе надане від передісторії замінюється, якщо обрати іншу.', items });
  },
  async pickFeat(ctx, e) {
    let text = '';
    try { text = (await loadLib('feats-text'))[`${e.n}|${e.s}`] || ''; } catch { /* без опису */ }
    const bonus = e.ab ? `Бонус характеристик: ${Object.entries(e.ab).map(([k, v]) => `${ABIL_UA[k] || k} +${v}`).join(', ')}${e.abc ? ' (на вибір)' : ''}\n` : '';
    ctx.addRow('featlist', { name: e.n, text: `${bonus}${text}`, src: `feat:${e.n}` });
    const items = (await featItems(ctx, e.n, `feat:${e.n}`, 'Риса')).filter((i) => i.id.startsWith('fsp:'));
    if (items.length) await runGrants(ctx, { src: `feat:${e.n}`, title: `Риса «${e.n}»: закляття`, intro: e.spc ? 'Частину заклять ця риса дає на вибір — додайте їх із бібліотеки заклять самостійно.' : '', items });
  },
  async pickSpell(ctx, e) {
    ctx.addRow('spellbook', await spellRow(e));
  },
  pickWeapon(ctx, e) {
    const str = ctx.get('str_mod'), dex = ctx.get('dex_mod');
    const fin = (e.pr || []).includes('F');
    const m = e.ty === 'R' ? dex : fin ? Math.max(str, dex) : str;
    const bw = Number(e.bw) || 0; // магічний бонус (+1/+2/+3)
    const dmgMod = m + bw;
    const dm = `${dnum(e.dmg || '1')}${dmgMod ? (dmgMod > 0 ? `+${dmgMod}` : dmgMod) : ''} ${DMG_TYPE[e.dt] || ''}`.trim();
    ctx.addRow('attacks', { name: e.n, bonus: m + bw + pbOf(ctx), dmg: dm });
  },
  pickGear(ctx, e) {
    if (['LA', 'MA', 'HA'].includes(e.ty) && e.ac) {
      const dex = ctx.get('dex_mod');
      ctx.data.ac = e.ac + (e.ty === 'LA' ? dex : e.ty === 'MA' ? Math.min(2, dex) : 0);
    } else if (e.ty === 'S' && e.ac) ctx.data.ac = (Number(ctx.data.ac) || 10) + e.ac;
    ctx.appendLine('equipment', `${e.n}${e.wt ? ` (${e.wt} фнт)` : ''}`);
  },
};

const actions = {
  ...libActions,
  featInfo(ctx, row) {
    ctx.showText({ title: row.name || 'Риса', text: row.text || '', onSave: (v) => { row.text = v; ctx.touch(); } });
  },
  spellInfo(ctx, row) { openSpellCard(ctx, row, host(ctx)); },
  spellCard(ctx, row) { openSpellCard(ctx, row, host(ctx)); },
  spellAttack(ctx, row) {
    const st = spellStats(ctx, row);
    ctx.rollD20(`Атака закляттям: ${row.name || ''}`, st.atk);
  },
  async spellQuick(ctx, row) { await castSpell(ctx, row, host(ctx), { attack: true, effect: true }); ctx.redraw(); },
  spellCast(ctx, row) { return actions.spellQuick(ctx, row); },
  async spellEffect(ctx, row) { await rollEffect(ctx, row, host(ctx), row.level); },
  spellDamage(ctx, row) { return actions.spellEffect(ctx, row); },
  attackRoll(ctx, row) {
    ctx.rollD20(`Атака: ${row.name || 'зброя'}`, Number(row.bonus) || 0);
  },
  async damageRoll(ctx, row) {
    const dice = parseDice(row.dmg);
    if (!dice) return ctx.log({ title: row.name || 'Шкода', lines: ['Вкажіть шкоду кубиками, наприклад 1д8+3'], success: null, crit: null });
    const r = await rollDice({ ...dice, label: `Шкода ${row.name || 'зброя'}` });
    ctx.log({ title: `Шкода: ${row.name || 'зброя'}`, lines: [`${diceText(dice)}: [${r.rolls.join(', ')}]${dice.plus ? ` ${sign(dice.plus)}` : ''}`], success: null, crit: null, headline: r.total });
  },
  async critDamage(ctx, row) {
    const dice = parseDice(row.dmg);
    if (!dice) return ctx.log({ title: row.name || 'Шкода', lines: ['Вкажіть шкоду кубиками, наприклад 1д8+3'], success: null, crit: null });
    const r = await rollDice({ ...dice, count: dice.count * 2, label: `Критична шкода ${row.name || 'зброя'}` });
    ctx.log({ title: `Критична шкода: ${row.name || 'зброя'}`, lines: [`${dice.count * 2}д${dice.sides}${dice.plus ? sign(dice.plus) : ''}: [${r.rolls.join(', ')}]${dice.plus ? ` ${sign(dice.plus)}` : ''}`], success: null, crit: 'success', headline: r.total });
  },
};

const ability = (id, label, skills) => ({ id, type: 'ability', label, default: 10, skills });
const text = (id, label, extra = {}) => ({ id, type: 'longtext', label, rows: 3, ...extra });

const slotFields = [];
for (let n = 1; n <= 9; n++) {
  slotFields.push({ id: `slots${n}`, type: 'number', label: `${n}-й рівень: усього`, min: 0, default: 0 });
  slotFields.push({ id: `slotsleft${n}`, type: 'counter', label: `${n}-й рівень: лишилось`, max: `slots${n}` });
}

const spellLevelTexts = [text('cantrips', 'Замовляння', { span: 2 })];
for (let n = 1; n <= 9; n++) spellLevelTexts.push(text(`spells${n}`, `${n}-й рівень`, { span: 2 }));

const throwRolls = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const abilityNames = { str: 'Сила', dex: 'Спритність', con: 'Статура', int: 'Інтелект', wis: 'Мудрість', cha: 'Харизма' };

const template = {
  id: 'dnd5e',
  name: 'D&D 5e',
  version: 1,
  theme: 'dnd',
  rollOptions: 'd20',
  columns: ['1fr', '1fr', '1.55fr'],
  actions,

  computed: [
    { id: 'pb', formula: 'floor((max(1, level) - 1) / 4) + 2' },
    { id: 'init', formula: 'dex_mod + init_bonus' },
    { id: 'passive_perception', formula: '10 + perception_val' },
    { id: 'passive_insight', formula: '10 + insight_val' },
    { id: 'passive_investigation', formula: '10 + investigation_val' },
    { id: 'jump_long', formula: 'str' },
    { id: 'jump_high', formula: '3 + str_mod' },
    { id: 'carry', formula: 'str * 15' },
    { id: 'spell_mod', formula: 'if(spell_abil == 1, int_mod, if(spell_abil == 2, wis_mod, if(spell_abil == 3, cha_mod, if(spell_abil == 4, str_mod, if(spell_abil == 5, dex_mod, if(spell_abil == 6, con_mod, 0))))))' },
    { id: 'spell_dc', formula: '8 + pb + spell_mod' },
    { id: 'spell_atk', formula: 'pb + spell_mod' },
  ],

  sections: [
    // ---------- шапка ----------
    {
      page: 'Персонаж', title: 'Клас і підклас', cols: 1, class: 'classes-card',
      fields: [{
        id: 'classes', type: 'list', addLabel: 'Додати клас вручну', empty: 'Клас не обрано. Оберіть з бібліотеки — вона заповнить володіння й навички.', minWidth: '420px',
        pick: { title: 'Клас', label: 'Клас з бібліотеки / мультиклас', kind: 'classes', action: 'pickClass', meta: (e) => `к${e.hd}${e.sc ? ' · заклинання' : ''}` },
        columns: [
          { id: 'name', label: 'Клас', type: 'text' },
          { id: 'sub', label: 'Підклас', type: 'text' },
          { id: 'level', label: 'Рівень', type: 'number', min: 1, max: 20, default: 1, width: '80px' },
        ],
        rowActions: [{ label: 'Підклас…', action: 'pickSubclass', hint: 'Обрати підклас із бібліотеки' }],
      }],
    },
    {
      page: 'Персонаж', cols: 6, class: 'hdr',
      fields: [
        { id: 'name', type: 'text', label: 'Ім’я персонажа', span: 2, placeholder: 'Безіменний персонаж' },
        { id: 'race', type: 'text', label: 'Раса', span: 2, pick: { title: 'Раса', kind: 'races', action: 'pickRace', meta: (e) => `${e.sp} фт${Object.keys(e.ab || {}).length ? ' · ' + Object.entries(e.ab).map(([k, v]) => `${ABIL_UA[k] || k} +${v}`).join(' ') : ''}` } },
        { id: 'level', type: 'number', label: 'Загальний рівень', min: 1, max: 20, default: 1 },
        { id: 'xp', type: 'number', label: 'Досвід', min: 0, default: 0 },
        { id: 'ac', type: 'number', label: 'Клас броні', min: 0, default: 10 },
        { id: 'speed', type: 'number', label: 'Швидкість (фути)', min: 0, default: 30 },
        { id: 'pb_view', type: 'computed', label: 'Володіння', formula: 'pb', format: 'signed' },
        { id: 'gold', type: 'number', label: 'Золото', min: 0, default: 0 },
        { id: 'hp_max', type: 'number', label: 'Макс. HP', min: 0, default: 0 },
        { id: 'hp', type: 'counter', label: 'Здоров’я', max: 'hp_max', class: 'big', span: 2 },
        { id: 'hp_temp', type: 'number', label: 'Тимчасові HP', min: 0, default: 0 },
      ],
    },

    // ---------- ліва колонка: Сила, Статура, Інтелект, Харизма ----------
    {
      page: 'Характеристики', column: 1, cols: 1, cardClass: 'plain',
      fields: [
        ability('str', 'Сила', [{ id: 'athletics', label: 'Атлетика' }]),
        ability('con', 'Статура', []),
        ability('int', 'Інтелект', [
          { id: 'investigation', label: 'Аналіз' }, { id: 'history', label: 'Історія' }, { id: 'arcana', label: 'Магія' },
          { id: 'nature', label: 'Природа' }, { id: 'religion', label: 'Релігія' },
        ]),
        ability('cha', 'Харизма', [
          { id: 'performance', label: 'Виступ' }, { id: 'intimidation', label: 'Залякування' },
          { id: 'deception', label: 'Обман' }, { id: 'persuasion', label: 'Переконання' },
        ]),
      ],
    },

    // ---------- середня колонка: Спритність, Мудрість, пасивні, володіння ----------
    {
      page: 'Характеристики', column: 2, cols: 1, cardClass: 'plain',
      fields: [
        ability('dex', 'Спритність', [
          { id: 'acrobatics', label: 'Акробатика' }, { id: 'sleight', label: 'Спритність рук' }, { id: 'stealth', label: 'Непомітність' },
        ]),
        ability('wis', 'Мудрість', [
          { id: 'perception', label: 'Сприйняття' }, { id: 'survival', label: 'Виживання' }, { id: 'medicine', label: 'Медицина' },
          { id: 'insight', label: 'Проникливість' }, { id: 'animal', label: 'Догляд за тваринами' },
        ]),
      ],
    },
    {
      page: 'Характеристики', column: 2, cols: 3, title: 'Пасивні відчуття',
      fields: [
        { id: 'pp_view', type: 'computed', label: 'Сприйняття', formula: 'passive_perception' },
        { id: 'pi_view', type: 'computed', label: 'Проникливість', formula: 'passive_insight' },
        { id: 'pn_view', type: 'computed', label: 'Аналіз', formula: 'passive_investigation' },
      ],
    },
    {
      page: 'Характеристики', column: 2, cols: 1, title: 'Володіння',
      fields: [
        { id: 'armor_prof', type: 'chips', label: 'Броня', options: ['Легка', 'Середня', 'Важка', 'Щит'] },
        { id: 'weapon_prof', type: 'chips', label: 'Зброя', options: ['Проста', 'Військова', 'Інша'] },
        text('other_prof', 'Інші володіння та мови', { rows: 4 }),
      ],
    },

    // ---------- права колонка: стани + вкладки ----------
    {
      page: 'Бій', title: 'Стан', cols: 4,
      fields: [
        { id: 'init_view', type: 'computed', label: 'Ініціатива', formula: 'init', format: 'signed' },
        { id: 'init_bonus', type: 'number', label: 'Бонус ініціативи', default: 0 },
        { id: 'init_roll', type: 'number', label: 'Кинута ініціатива (бачить ГМ)', hint: 'Запам’ятовується після кидка й не зникає з очищенням історії' },
        { id: 'inspiration', type: 'checkbox', label: 'Натхнення' },
        { id: 'exhaustion', type: 'track', label: 'Виснаження', max: 6, span: 4 },
        {
          id: 'conditions', type: 'chips', label: 'Ефекти та стани', span: 4,
          options: CONDITIONS.dnd5e,
        },
      ],
    },
    {
      page: 'Бій', title: 'Атаки', cols: 1,
      fields: [
            {
              id: 'attacks', type: 'list', addLabel: 'Додати атаку',
              pick: { title: 'Зброя', label: 'Зброя з бібліотеки', kind: 'items', action: 'pickWeapon', meta: (e) => `${e.dmg || ''} ${DMG_TYPE[e.dt] || ''} · ${e.cat || ''}`,
                facets: [{ label: 'Категорія', get: (e) => (e.cat && e.dmg ? (e.mg ? 'магічна' : e.cat) : []) }] }, empty: 'Атак немає', minWidth: '480px',
              columns: [
                { id: 'name', label: 'Назва', type: 'text' },
                { id: 'bonus', label: 'Бонус', type: 'number', default: 0, width: '70px' },
                { id: 'dmg', label: 'Шкода / вид', type: 'text', placeholder: '1д8+3 колюча', width: '150px' },
              ],
              rowActions: [
                { label: 'Атака', action: 'attackRoll', hint: 'd20 + бонус' },
                { label: 'Шкода', action: 'damageRoll' },
                { label: 'Крит', action: 'critDamage', hint: 'Кубики шкоди подвоєно' },
              ],
            },
            text('attack_notes', 'Нотатки до бою'),
      ],
    },
    {
      page: 'Закляття', title: 'Параметри заклинання', cols: 3,
      fields: [
        { id: 'spell_abil', type: 'select', label: 'Характеристика', options: [{ value: 0, label: '—' }, { value: 1, label: 'Інтелект' }, { value: 2, label: 'Мудрість' }, { value: 3, label: 'Харизма' }, { value: 4, label: 'Сила' }, { value: 5, label: 'Спритність' }, { value: 6, label: 'Статура' }], default: 0 },
        { id: 'sdc_view', type: 'computed', label: 'Спаскидок (СЛ)', formula: 'spell_dc' },
        { id: 'sat_view', type: 'computed', label: 'Бонус атаки', formula: 'spell_atk', format: 'signed' },
      ],
    },
    {
      page: 'Закляття', title: 'Ячейки заклять', cols: 1,
      fields: [{ id: 'slots_view', type: 'slots', levels: 9 }],
    },
    {
      page: 'Закляття', title: 'Книга заклять', cols: 1,
      fields: [{
        id: 'spellbook', type: 'list', addLabel: 'Додати закляття вручну', empty: 'Заклять немає. Додайте з бібліотеки — з описом.', minWidth: '520px',
        pick: { title: 'Закляття', label: 'Закляття з бібліотеки', kind: 'spells', action: 'pickSpell', meta: (e) => `${e.l === 0 ? 'замовляння' : e.l + '-й рівень'} · ${SCHOOLS[e.sc] || e.sc}${e.dmg ? ' · ' + dnum(e.dmg) : ''}`,
      facets: [{ label: 'Рівень', get: (e) => e.l, fmt: (v) => (v === 0 ? 'замовляння' : v + '-й рівень') }, { label: 'Клас', get: (e) => e.cl || [] }] },
        columns: [
          { id: 'name', label: 'Назва', type: 'text' },
          { id: 'level', label: 'Рів.', type: 'number', min: 0, max: 9, default: 1, width: '64px' },
          { id: 'time', label: 'Час', type: 'text', width: '90px', placeholder: '1 дія' },
          { id: 'range', label: 'Дистанція', type: 'text', width: '100px' },
          { id: 'dmg', label: 'Шкода', type: 'text', width: '90px', placeholder: '8д6' },
          { id: 'abil', label: 'Хар-ка', type: 'select', options: ['Осн.', 'ІНТ', 'МДР', 'ХАР', 'СИЛ', 'СПР', 'СТАТ'], width: '84px' },
        ],
        rowActions: [
          { label: 'Картка', action: 'spellCard', hint: 'Опис, що робить закляття, вибір ячейки та кидки' },
          { label: 'Вимовити', action: 'spellQuick', hint: 'Витрачає ячейку цього рівня й кидає атаку та ефект' },
          { label: 'Атака', action: 'spellAttack', hint: 'Бонус атаки закляттям', when: (r) => r.atk !== 0 && r.atk !== false },
          { label: 'Шкода', labelOf: (r) => effectLabel(r), action: 'spellEffect', hint: 'Кидок ефекту (для вищої ячейки відкрийте картку)', when: (r) => !!String(r.dmg || '').trim() },
        ],
      }],
    },
    {
      page: 'Здібності', title: 'Здібності та риси', cols: 2,
      fields: [
        { id: 'jh_view', type: 'computed', label: 'Стрибок у висоту (фути)', formula: 'jump_high' },
        { id: 'jl_view', type: 'computed', label: 'Стрибок у довжину (фути)', formula: 'jump_long' },
        text('abilities_notes', 'Вміння та здібності', { span: 2, rows: 6 }),
        text('extra_abilities', 'Додаткові здібності та вміння', { span: 2 }),
      ],
    },
    {
      page: 'Здібності', title: 'Риси (feats)', cols: 1,
      fields: [{
        id: 'featlist', type: 'list', addLabel: 'Додати рису вручну', empty: 'Рис немає. Додайте з бібліотеки — з описом.', minWidth: '360px',
        pick: { title: 'Риса', label: 'Риса з бібліотеки', kind: 'feats', action: 'pickFeat', meta: (e) => (e.ab ? `бонус: ${Object.entries(e.ab).map(([k, v]) => `${ABIL_UA[k] || k} +${v}`).join(' ')}` : '') + (e.pre ? ' · є вимоги' : '') },
        columns: [{ id: 'name', label: 'Назва', type: 'text' }],
        rowActions: [{ label: 'Опис', action: 'featInfo', hint: 'Що дає ця риса' }],
      }],
    },
    {
      page: 'Здібності', title: 'Риси раси та передісторії', cols: 1,
      fields: [{
        id: 'features', type: 'list', addLabel: 'Додати вручну', empty: 'З’являться автоматично, коли оберете расу та передісторію з бібліотеки.', minWidth: '360px',
        columns: [{ id: 'name', label: 'Назва', type: 'text' }],
        rowActions: [{ label: 'Опис', action: 'featInfo' }],
      }],
    },
    {
      page: 'Спорядження', title: 'Спорядження', cols: 2,
      fields: [
        { id: 'carry_view', type: 'computed', label: 'Вантажопідйомність (фунти)', formula: 'carry' },
        { id: 'size', type: 'select', label: 'Розмір', options: ['Крихітний', 'Малий', 'Середній', 'Великий', 'Величезний', 'Гігантський'], default: 'Середній' },
            text('equipment', 'Спорядження', { span: 2, rows: 6, pick: { title: 'Предмет', kind: 'items', action: 'pickGear', meta: (e) => `${ITEM_TYPES[e.ty] || e.ty}${e.ac ? ' · КБ ' + e.ac : ''}${e.dmg ? ' · ' + dnum(e.dmg) : ''}${e.rar ? ' · ' + e.rar : ''}${money(e.v) ? ' · ' + money(e.v) : ''}`,
      facets: [{ label: 'Тип', get: (e) => ITEM_TYPES[e.ty] || e.ty }, { label: 'Рідкість', get: (e) => e.rar || [] }] } }),
        text('treasure', 'Скарби', { span: 2 }),
      ],
    },
    {
      page: 'Особистість', title: 'Особистість', cols: 2,
      fields: [
            { id: 'background', type: 'text', label: 'Передісторія', pick: { title: 'Передісторія', kind: 'backgrounds', action: 'pickBackground', meta: (e) => (e.sk || []).join(', ') } },
            { id: 'alignment', type: 'text', label: 'Світогляд' },
            text('appearance', 'Зовнішність', { span: 2, rows: 2 }),
            { id: 'height', type: 'text', label: 'Зріст' },
            { id: 'weight', type: 'text', label: 'Вага' },
            { id: 'age', type: 'text', label: 'Вік' },
            { id: 'eyes', type: 'text', label: 'Очі' },
            { id: 'skin', type: 'text', label: 'Шкіра' },
            { id: 'hair', type: 'text', label: 'Волосся' },
            text('backstory', 'Передісторія персонажа', { span: 2, rows: 5 }),
            text('allies', 'Союзники та організації', { span: 2 }),
            text('traits', 'Риси характеру', { span: 2 }),
            text('ideals', 'Ідеали', { span: 2 }),
            text('bonds', 'Прив’язаності', { span: 2 }),
            text('flaws', 'Слабкості', { span: 2 }),
            text('goals', 'Цілі та завдання', { span: 2, rows: 4 }),
      ],
    },
    {
      page: 'Нотатки', title: 'Нотатки', cols: 1,
      fields: [{
        id: 'notes', type: 'list', addLabel: 'Додати нотатку', empty: 'Нотаток немає',
        columns: [{ id: 'title', label: 'Заголовок', type: 'text', width: '30%' }, { id: 'body', label: 'Текст', type: 'text' }],
      }],
    },
  ],

  // Загальний рівень = сума рівнів класів (мультиклас)
  derive(data) {
    const rows = Array.isArray(data.classes) ? data.classes : [];
    const sum = rows.reduce((a, r) => a + (Number(r.level) || 0), 0);
    if (rows.length && sum > 0) data.level = Math.min(20, sum);
  },

  pageColumns: { 'Характеристики': ['1fr', '1fr'] },

  rolls: [
    { group: 'Перевірки', items: throwRolls.map((id) => ({ id: `c_${id}`, mode: 'check', die: 20, label: abilityNames[id], mod: `${id}_mod` })) },
    { group: 'Спаскидки', items: throwRolls.map((id) => ({ id: `s_${id}`, mode: 'check', die: 20, label: `${abilityNames[id]}: спаскидок`, mod: `${id}_savemod` })) },
    { group: 'Інше', items: [
      { id: 'init', mode: 'check', die: 20, label: 'Ініціатива', mod: 'init', store: 'init_roll' },
      { id: 'death', mode: 'threshold', die: 20, label: 'Спаскидок від смерті (від 10)', min: 10 },
    ] },
  ],
};

// Блоки характеристик — окремими секціями, щоб у вузькому вікні йшли в порядку Сил–Спр–Стат–Інт–Мдр–Хар
const ORDER = { str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6, passive: 7, prof: 8 };
{
  const i = template.sections.findIndex((x) => x.class === 'classes-card');
  const [card] = template.sections.splice(i, 1);
  template.sections.splice(1, 0, card);
}
template.sections = template.sections.flatMap((sec) => {
  if (sec.cardClass === 'plain') return sec.fields.map((f) => ({ ...sec, fields: [f], order: ORDER[f.id] }));
  if (sec.title === 'Пасивні відчуття') return [{ ...sec, order: ORDER.passive }];
  if (sec.title === 'Володіння') return [{ ...sec, order: ORDER.prof }];
  return [sec];
});

export default template;
