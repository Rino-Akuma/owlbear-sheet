// Шаблон системи «Континент» (d100). Усі формули взяті з «Посібника по Континенту».
import { parseDice, rollDice } from '../engine/dice.js';
import { CONDITIONS } from '../conditions.js';
import { pickMany, loadLib } from '../library.js';
import { gAdd, gSet, gRows, runGrants, grantedBy } from '../grants.js';

const STAT_MAX = 200;

const checkRoll = (id, label, mod) => ({ id, type: 'roll', mode: 'check', label, mod });

const actions = {
  // Шкода зброї: (база + d100, не більше характеристики) × коефіцієнт.
  // Якщо характеристика більша за 100 — можливий другий кидок (правило з посібника).
  async weaponDamage(ctx, row) {
    const stat = ctx.get(row.stat === 'СПР' ? 'dex_eff' : 'str_eff');
    const dice = parseDice(row.base);
    if (!dice) {
      return ctx.log({ title: row.name || 'Зброя', lines: ['Вкажіть базову шкоду, наприклад 1д8'], success: null, crit: null });
    }
    const r1 = await ctx.d100();
    const excess = Math.max(0, stat - 100);
    const threshold = 100 - excess;
    let r2 = null;
    let raw = r1;
    if (stat > 100 && r1 >= threshold) {
      r2 = await ctx.d100();
      raw = r1 + r2;
    }
    const bonus = Math.min(raw, stat);
    const base = await rollDice({ ...dice, label: `Шкода ${row.name || 'зброї'}` });
    const coef = Number(row.coef);
    const k = Number.isFinite(coef) ? coef : 1;
    const total = Math.round((base.total + bonus) * k);
    const lines = [
      `База ${dice.count}д${dice.sides}${dice.plus ? (dice.plus > 0 ? '+' : '') + dice.plus : ''}: [${base.rolls.join(', ')}] = ${base.total}`,
      `Бонус: d100 ${r1}${r2 !== null ? ` + ${r2}` : ''} → ${bonus} (ліміт — характеристика ${stat})`,
      `Коефіцієнт ×${k}`,
    ];
    ctx.log({ title: `Шкода: ${row.name || 'зброя'}`, lines, success: null, crit: null, headline: total });
  },

  // Вимовляння заклинання: автоуспіх, якщо Воля вища за складність (крім 5 і 6 рівнів), інакше d100 + Воля/5.
  showDesc(ctx, row) {
    ctx.showText({
      title: row.name || 'Закляття',
      meta: [row.school, row.level ? `рівень ${row.level}` : '', row.cost ? `МВ ${row.cost}` : '', row.range].filter(Boolean).join(' · '),
      text: row.desc || '',
      onSave: (v) => { row.desc = v; ctx.touch(); },
    });
  },
  async castSpell(ctx, row) {
    const o = ctx.opts();
    const level = Math.max(1, Math.min(6, Number(row.level) || 1));
    const std = { 1: 30, 2: 50, 3: 75, 4: 85, 5: 100 };
    const diff = std[level] ?? (o.difficulty || 0);
    const wil = ctx.get('wil_eff');
    const lines = [`Рівень ${level}, складність ${diff || '—'}, Воля ${wil}`];
    let success;
    let headline = null;
    let crit = null;
    if (level <= 4 && wil > diff) {
      success = true;
      lines.push('Воля вища за складність — успіх автоматично');
    } else {
      const nat = await ctx.d100();
      const mod = Math.floor(wil / 5);
      const total = nat + mod + o.bonus;
      success = diff ? total > diff : null;
      headline = total;
      crit = nat >= o.critHi ? 'success' : nat <= o.critLo ? 'fail' : null;
      lines.push(`d100: ${nat} + Воля/5: ${mod}${o.bonus ? ` + бонус: ${o.bonus}` : ''} = ${total}`);
    }
    if (success === false) {
      lines.push(`Провал: киньте d100 + Статура/5 і d100 + Воля/5 проти ${diff} (фізична / психічна травма)`);
    }
    const cost = Number(row.cost) || 0;
    const cur = ctx.get('mv');
    const max = ctx.get('mv_max');
    const over = Math.max(0, cost - cur);
    lines.push(`Магічна витривалість: −${cost} (було ${cur} з ${max})`);
    if (cost > max / 2) lines.push('Магічне перевантаження: вартість більша за половину запасу — травма (d4: 1–2 фізична, 3–4 психічна).');
    if (over > 0) lines.push(`Бракує ${over} МВ: кожна одиниця «в мінус» дає окрему травму.`);
    if (row.conc) lines.push('Потрібна концентрація.');
    ctx.log({ title: `Закляття: ${row.name || '—'}`, lines, success, crit, headline });
    ctx.setData('mv', Math.max(0, cur - cost));
  },

  // Шкода закляття + додаткові куби від Волі (посібник, «Масштабування сили магії»):
  // за кожні 20 Волі (перші 20 не рахуються) — 1 крок; рівень 1: +1 куб, 2–3: +2, 4: +3, 5–6: +4 за крок.
  async spellDamage(ctx, row) {
    const dice = parseDice(row.dmg);
    if (!dice) {
      return ctx.log({ title: row.name || 'Закляття', lines: ['Вкажіть шкоду кубиками, наприклад 1д8'], success: null, crit: null });
    }
    const level = Math.max(1, Math.min(6, Number(row.level) || 1));
    const wil = ctx.get('wil_eff');
    const steps = Math.max(0, Math.floor(wil / 20) - 1);
    const extra = steps * ({ 1: 1, 2: 2, 3: 2, 4: 3 }[level] || 4);
    const r = await rollDice({ ...dice, count: dice.count + extra, label: `Шкода ${row.name || 'закляття'}` });
    const fmt = `${dice.count + extra}д${dice.sides}${dice.plus ? (dice.plus > 0 ? '+' : '') + dice.plus : ''}`;
    ctx.log({
      title: `Шкода: ${row.name || 'закляття'}`,
      lines: [`${fmt}: [${r.rolls.join(', ')}]`,
        extra ? `Базово ${dice.count}д${dice.sides} + ${extra} куб. від Волі ${wil} (рівень ${level})` : `Волі ${wil} ще не вистачає на додаткові куби (потрібно від 40)`],
      success: null, crit: null, headline: r.total,
    });
  },

  // ---------- бібліотека ----------
  // Напівкровка: обираємо двох батьківських рас, а успадковане (за кидками майстра) відмічається вручну.
  async pickHalfBlood(ctx, e) {
    const all = await loadLib('kont-races');
    const ok = new Set(['Людина', 'Ельф', 'Гноми', 'Орки', 'Велетні']); // невмерлі й інферніти не розмножуються, драконіди — лише між собою
    const picked = await pickMany({
      title: 'Напівкровка: які раси батьків?',
      hint: 'Оберіть дві раси. Невмерлі й інферніти не розмножуються, драконіди — лише між собою, тому їх немає в списку.',
      options: all.filter((r) => ok.has(r.n)).map((r) => ({ value: r.n, label: r.n })), count: 2,
    });
    if (!picked) return;
    const parents = all.filter((r) => picked.includes(r.n));
    ctx.data.race = `Напівкровка (${picked.join(' / ')})`;
    const NAMES = { str: 'Сила', dex: 'Спритність', con: 'Статура', wil: 'Воля' };
    const items = [{ id: 'base', group: 'Напівкровка', label: 'Нотатка про походження', text: `Батьки: ${picked.join(' і ')}. Успадкування визначається кидками.`,
      apply: (c) => gRows(c, 'effects', [{ name: 'Напівкровка', desc: `Батьки: ${picked.join(' і ')}. Успадкування визначається кидками кубиків; домінантна ознака — нездатність до магії у гномів (завжди передається).` }], 'race') }];
    parents.forEach((p) => {
      const g = `Від раси «${p.n}» — відмітьте те, що успадковано`;
      Object.entries(p.st || {}).forEach(([k, v]) => items.push({ id: `${p.n}:st:${k}`, group: g, checked: false, label: `${NAMES[k]} ${v > 0 ? '+' : '−'}${Math.abs(v)}`, text: 'до поточного значення', apply: (c) => gAdd(c, k, v) }));
      (p.fx || []).forEach((f, i) => items.push({ id: `${p.n}:fx:${i}`, group: g, checked: /магі/i.test(f.name) && /Нездатн/i.test(f.name), label: f.name, text: f.desc,
        apply: (c) => gRows(c, 'effects', [{ name: `${f.name} (${p.n})`, desc: f.desc }], 'race') }));
    });
    items.push({ id: 'own', group: 'Своє', label: 'Додати порожній рядок для власної особливості', text: 'впишіть у «Додаткові ефекти» вручну: поле розтягується під довгий текст',
      apply: (c) => gRows(c, 'effects', [{ name: 'Особливість напівкровки', desc: '' }], 'race') });
    await runGrants(ctx, { src: 'race', title: 'Напівкровка: що успадковано', intro: 'За правилами успадкування визначається кидками, тому нічого не відмічено наперед, окрім домінантної нездатності до магії від гномів. Відмічайте те, що випало, а зайве, чого немає в посібнику, дописуйте руками.', items });
  },

  async pickRace(ctx, e) {
    if (e.n === 'Напівкровки') return actions.pickHalfBlood(ctx, e);
    ctx.data.race = e.n;
    const NAMES = { str: 'Сила', dex: 'Спритність', con: 'Статура', wil: 'Воля' };
    const items = Object.entries(e.st || {}).map(([k, v]) => ({
      id: `st:${k}`, group: 'Характеристики', label: `${NAMES[k]} ${v > 0 ? '+' : '−'}${Math.abs(v)}`, text: 'до поточного значення',
      apply: (c) => gAdd(c, k, v),
    }));
    if (e.mv) items.push({ id: 'mv', group: 'Характеристики', label: `Магічна витривалість +${e.mv}`, text: 'лише для немагічних класів (додається в «Додаткова МВ»)', apply: (c) => gAdd(c, 'mv_bonus', e.mv) });
    if (e.armor) items.push({ id: 'armor', group: 'Характеристики', label: `Обладунок +${e.armor}`, text: 'вбудована луска', apply: (c) => gAdd(c, 'armor', e.armor) });
    (e.fx || []).forEach((f, i) => items.push({ id: `fx:${i}`, group: 'Особливості (додадуться до «Додаткові ефекти»)', label: f.name, text: f.desc, apply: (c) => gRows(c, 'effects', [{ name: f.name, desc: f.desc }], 'race') }));
    await runGrants(ctx, { src: 'race', title: `Раса «${e.n}»: що вона дає`, intro: `${e.desc}\n\nЗніміть позначки з того, що не потрібно. Надане можна замінити, обравши іншу расу. Підвищені максимуми характеристик (120, 200 тощо) тримайте в голові: поле характеристики не обмежує значення нижче 200.`, items });
  },

  async pickBackground(ctx, e) {
    ctx.data.background = e.n;
    const listOf = (cat) => (cat === 'Соціальність' ? 'social' : 'skills');
    const items = [];
    (e.g || []).forEach((g, gi) => {
      if (g.cat === 'Ремесло') {
        if (g.any) {
          items.push({ id: `g:${gi}`, group: 'Ремесло', label: `Ремесло +${g.b} до одного з:`, choose: { count: 1, options: g.subs.map(([n]) => ({ value: n, label: n })) },
            apply: (c, picks) => gRows(c, 'skills', picks.map((n) => ({ name: n, desc: `+${g.b} (ремесло)` })), 'bg') });
        } else {
          const [n, b] = g.subs[0];
          items.push({ id: `g:${gi}`, group: 'Ремесло', label: `${n} +${b}`, apply: (c) => gRows(c, 'skills', [{ name: n, desc: `+${b} (ремесло)` }], 'bg') });
        }
        return;
      }
      const rows = [];
      if (g.b) rows.push({ name: g.cat, desc: `+${g.b} (вся група)` });
      g.subs.forEach(([n, b]) => rows.push({ name: n, desc: `+${b}` }));
      items.push({ id: `g:${gi}`, group: g.cat === 'Соціальність' ? 'Соціальні навички' : 'Навички', label: `${g.cat}${g.b ? ` +${g.b}` : ''}`,
        text: g.subs.map(([n, b]) => `${n} +${b}`).join(', '), apply: (c) => gRows(c, listOf(g.cat), rows, 'bg') });
    });
    await runGrants(ctx, { src: 'bg', title: `Передісторія «${e.n}»: що вона дає`, intro: `${e.desc}\n\nБонуси додадуться до списків навичок. Усе надане від передісторії замінюється, якщо обрати іншу.`, items });
  },

  async pickFeat(ctx, e) {
    const src = `feat:${e.n}`;
    let tier = null;
    if (e.tiers && e.tiers.length) {
      const had = grantedBy(ctx, src).length ? (Array.isArray(ctx.data.traits) ? ctx.data.traits : []).find((r) => r.src === src) : null;
      const cur = had ? e.tiers.findIndex((v) => String(had.name).includes(`(${v})`)) : -1;
      const picked = await pickMany({
        title: `«${e.n}»: який рівень риси?`,
        hint: `${e.eff.split('\n')[0]}${had ? ` · зараз: ${e.tiers[cur] ?? '—'}` : ' · при першому виборі — найменший бонус, надалі риса підсилюється повторним вибором'}`,
        options: e.tiers.map((v, i) => ({ value: i, label: v })), count: 1,
      });
      if (!picked) return;
      tier = picked[0];
    }
    const chosen = tier === null ? null : e.tiers[tier];
    const eff = chosen === null ? e.eff : e.eff.slice(0, e.tspan[0]) + chosen + e.eff.slice(e.tspan[1]);
    // ефект і вимоги — окремими рядками, щоб не змішувались
    const row = { name: chosen === null ? e.n : `${e.n} (${chosen})`, desc: `${eff}${e.req ? `\nВимоги: ${e.req}` : ''}` };
    const items = [{ id: 'row', group: 'Риса', label: row.name, text: row.desc.length > 160 ? `${row.desc.slice(0, 160)}…` : row.desc, apply: (c) => gRows(c, 'traits', [row], src) }];
    const num = (s) => Number(String(s).replace(/[^\d.]/g, ''));
    if (e.n === 'Стійкий' && chosen) items.push({ id: 'hp', group: 'Автоматично', label: `Множник HP ${chosen}`, text: 'ХП = Статура × множник', apply: (c) => gSet(c, 'hp_mult', num(chosen)) });
    if (e.n === 'Покращене фехтування' && chosen) items.push({ id: 'react', group: 'Автоматично', label: `Бонус до дій у відповідь ${chosen}`, apply: (c) => gAdd(c, 'react_bonus', num(chosen)) });
    if (e.n === 'Швидкі ноги' && chosen) items.push({ id: 'spd', group: 'Автоматично', label: `Швидкість ${chosen} м`, apply: (c) => gAdd(c, 'speed', num(chosen)) });
    await runGrants(ctx, { src, title: `Риса «${e.n}»`, intro: e.req ? `Вимоги: ${e.req}` : '', items });
  },

  pickSpell(ctx, e) {
    const tail = [e.ty && `Вид: ${e.ty}`, e.dur && `Тривалість: ${e.dur}`].filter(Boolean).join('. ');
    ctx.addRow('spells', { name: e.n, school: e.sch, level: e.l, cost: e.cost, dmg: e.dmg, range: e.rng, conc: e.conc, desc: [e.desc, tail].filter(Boolean).join('\n\n') });
  },

  async pickWeapon(ctx, e) {
    let g = e.g[0];
    if (!g) return;
    if (e.g.length > 1) {
      const picked = await pickMany({
        title: `«${e.n}»: як тримаєте?`, hint: 'Одноручний і дворучний хват мають різну шкоду.',
        options: e.g.map((x, i) => ({ value: i, label: `${x.h === 1 ? 'Одноруч' : 'Двуруч'} ${x.dmg} · ${x.st} · ×${x.k}` })), count: 1,
      });
      if (!picked) return;
      g = e.g[picked[0]];
    }
    let stat = g.st;
    if (stat === 'СИЛ/СПР') stat = ctx.get('dex_eff') > ctx.get('str_eff') ? 'СПР' : 'СИЛ';
    const note = [e.dt, e.fenc && 'фехтувальна', g.sz, g.kt, e.note, g.st === 'СИЛ/СПР' ? 'може СИЛ або СПР' : '', e.price && `~${String(e.price).replace('~', '')}`].filter(Boolean).join(' · ');
    ctx.addRow('weapons', { name: e.g.length > 1 ? `${e.n} (${g.h === 1 ? 'одноруч' : 'двуруч'})` : e.n, stat, base: g.dmg, coef: g.k, notes: note });
  },

  async pickItem(ctx, e) {
    const parts = [];
    if (e.cat === 'Алхімія') {
      parts.push(e.desc, `Вартість (інгредієнти/ринкова): ${e.price}`, `Навичка: ${e.alc.skill}`, `Обладнання: ${e.alc.equip}`);
      if (e.alc.rare) parts.push(`Рідкісні інгредієнти: ${e.alc.rare}`);
    } else {
      if (e.ac) parts.push(`Броня ${e.ac}`);
      parts.push(e.bonus, e.limit, e.req && `Вимоги: ${e.req}`, e.desc, e.price && `Ціна ${e.price}`);
    }
    const row = { name: e.n, qty: 1, desc: parts.filter(Boolean).join(' · ') };
    const kind = /обладунк/i.test(e.cat) ? 'body' : e.cat === 'Щити' ? 'shield' : null;
    if (!kind || !e.ac) return ctx.addRow('items', row);
    await runGrants(ctx, {
      src: `gear:${kind}`, title: `${e.n}: що дає`,
      intro: kind === 'body' ? 'Новий обладунок замінює попередній, обраний через бібліотеку. Щит враховується окремо.' : 'Щит збільшує загальну броню. Новий щит замінює попередній, обраний через бібліотеку.',
      items: [
        { id: 'ac', group: 'Броня', label: `Обладунок +${e.ac}`, text: 'додається до поля «Обладунок»', apply: (c) => gAdd(c, 'armor', e.ac) },
        { id: 'row', group: 'Інвентар', label: `Додати «${e.n}» до предметів`, text: row.desc, apply: (c) => gRows(c, 'items', [row], `gear:${kind}`) },
      ],
    });
  },
};

const ST_UA = { str: 'СИЛ', dex: 'СПР', con: 'СТА', wil: 'ВОЛ' };
const raceMeta = (e) => Object.entries(e.st || {}).map(([k, v]) => `${ST_UA[k]} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(' ') || 'без змін характеристик';

export default {
  id: 'kontynent',
  name: 'Континент',
  version: 1,
  actions,

  computed: [
    { id: 'penalty', label: 'Штраф від поранень', formula: 'inj_light * 2 + inj_mid * 5 + inj_heavy * 15 + inj_mortal * 30' },
    { id: 'str_eff', formula: 'max(0, str - penalty)' },
    { id: 'dex_eff', formula: 'max(0, dex - penalty)' },
    { id: 'con_eff', formula: 'max(0, con - penalty)' },
    { id: 'wil_eff', formula: 'max(0, wil - penalty)' },
    { id: 'str_mod', formula: 'floor(str_eff / 5)' },
    { id: 'dex_mod', formula: 'floor(dex_eff / 5)' },
    { id: 'con_mod', formula: 'floor(con_eff / 5)' },
    { id: 'wil_mod', formula: 'floor(wil_eff / 5)' },
    { id: 'max_hp', formula: 'round(con_eff * hp_mult)' },
    { id: 'mv_max', formula: 'floor((if(is_mage, 10 + floor(wil_eff / 5), 0) + mv_bonus) / if(exh_mag >= 2, 2, 1))' },
  ],

  sections: [
    {
      page: 'Персонаж', title: 'Персонаж', cols: 4,
      fields: [
        { id: 'name', type: 'text', label: 'Ім’я', span: 2 },
        { id: 'race', type: 'text', label: 'Раса', pick: { title: 'Раса', kind: 'kont-races', action: 'pickRace', meta: raceMeta } },
        { id: 'level', type: 'number', label: 'Рівень', min: 0, default: 0 },
        { id: 'background', type: 'text', label: 'Передісторія', span: 2, pick: { title: 'Передісторія', kind: 'kont-backgrounds', action: 'pickBackground', meta: (e) => (e.g || []).map((x) => x.cat).join(', ') } },
        { id: 'info', type: 'longtext', label: 'Додаткова інформація', span: 4, rows: 2 },
      ],
    },
    {
      page: 'Персонаж', title: 'Характеристики', cols: 4,
      fields: [
        { id: 'str', type: 'stat', label: 'Сила', min: 0, max: STAT_MAX, default: 20, eff: 'str_eff', mod: 'str_mod' },
        { id: 'dex', type: 'stat', label: 'Спритність', min: 0, max: STAT_MAX, default: 20, eff: 'dex_eff', mod: 'dex_mod' },
        { id: 'con', type: 'stat', label: 'Статура', min: 0, max: STAT_MAX, default: 20, eff: 'con_eff', mod: 'con_mod' },
        { id: 'wil', type: 'stat', label: 'Воля', min: 0, max: STAT_MAX, default: 20, eff: 'wil_eff', mod: 'wil_mod' },
        { type: 'note', span: 4, text: 'Різниця між Силою і Спритністю не може перевищувати співвідношення 2:1.', showIf: 'max(str, dex) > 2 * min(str, dex)' },
        { type: 'note', span: 4, text: 'Незаліковані поранення знижують усі характеристики (і Статуру, а отже й максимум HP).', showIf: 'penalty > 0' },
      ],
    },
    {
      page: 'Стан', title: 'Стан', cols: 4,
      fields: [
        { id: 'hp', type: 'counter', label: 'Здоров’я', max: 'max_hp', class: 'big', span: 2 },
        { id: 'armor', type: 'number', label: 'Обладунок', min: 0, default: 0 },
        { id: 'speed', type: 'number', label: 'Швидкість (м)', min: 0, default: 0 },
        { id: 'hp_mult', type: 'number', label: 'Множник HP (риса «Стійкий» ×3 / ×4)', min: 1, default: 2 },
        { id: 'init_roll', type: 'number', label: 'Кинута ініціатива (бачить ГМ)', hint: 'Запам’ятовується після кидка й не зникає з очищенням історії' },
        { id: 'conditions', type: 'chips', label: 'Стани', span: 4, options: CONDITIONS.kontynent },
        { id: 'react_bonus', type: 'number', label: 'Бонус до дій у відповідь', min: 0, default: 0 },
        { id: 'react_std', type: 'computed', label: 'Дії у відповідь', formula: '1 + react_bonus' },
        { id: 'react_fencing', type: 'computed', label: 'Дії у відповідь (фехтувальна зброя)', formula: 'max(1, floor(dex_eff / 20)) + react_bonus' },
        { id: 'is_mage', type: 'checkbox', label: 'Володіє магією' },
        { id: 'mv_bonus', type: 'number', label: 'Додаткова МВ (напр. інферніти +10)', min: 0, default: 0 },
        { id: 'mv', type: 'counter', label: 'Магічна витривалість', max: 'mv_max', span: 2 },
        { id: 'exh_phys', type: 'track', label: 'Фізичне виснаження', max: 5, span: 2 },
        { id: 'exh_mag', type: 'track', label: 'Магічне виснаження', max: 5, span: 2 },
        { id: 'inj_light', type: 'number', label: 'Легкі поранення (−2)', min: 0, default: 0 },
        { id: 'inj_mid', type: 'number', label: 'Середні (−5)', min: 0, default: 0 },
        { id: 'inj_heavy', type: 'number', label: 'Важкі (−15)', min: 0, default: 0 },
        { id: 'inj_mortal', type: 'number', label: 'Смертельні (−30)', min: 0, default: 0 },
        { id: 'penalty_view', type: 'computed', label: 'Штраф до характеристик', formula: 'penalty', format: 'signed', hint: 'Рахується з поранень' },
      ],
    },
    {
      page: 'Зброя', title: 'Зброя', cols: 1,
      fields: [{
        id: 'weapons', type: 'list', minWidth: '640px', addLabel: 'Додати зброю', empty: 'Зброї немає',
        pick: { title: 'Зброя', label: 'Зброя з бібліотеки', kind: 'kont-weapons', action: 'pickWeapon', facets: [{ label: 'Вид шкоди', get: (e) => e.dt }],
          meta: (e) => e.g.map((x) => `${x.h === 1 ? '1р' : '2р'} ${x.dmg} ${x.st}`).join(' / ') },
        columns: [
          { id: 'name', label: 'Назва', type: 'text' },
          { id: 'stat', label: 'Хар-ка', type: 'select', options: ['СИЛ', 'СПР'], width: '80px' },
          { id: 'base', label: 'Базова шкода', type: 'text', placeholder: '1д8', width: '100px' },
          { id: 'coef', label: 'Коеф.', type: 'number', step: 0.5, default: 1, width: '70px' },
          { id: 'notes', label: 'Нотатки', type: 'text' },
        ],
        rowActions: [{ label: 'Шкода', action: 'weaponDamage', hint: '(база + d100, не більше характеристики) × коефіцієнт' }],
      }],
    },
    {
      page: 'Закляття', title: 'Закляття', cols: 1,
      fields: [{
        id: 'spells', type: 'list', minWidth: '720px', addLabel: 'Додати закляття', empty: 'Заклять немає',
        pick: { title: 'Закляття', label: 'Закляття з бібліотеки', kind: 'kont-spells', action: 'pickSpell',
          facets: [{ label: 'Школа', get: (e) => e.sch }, { label: 'Рівень', get: (e) => e.l, fmt: (v) => `${v} рівень` }],
          meta: (e) => `${e.sch} · ${e.l} рів. · МВ ${e.cost}${e.dmg ? ` · ${e.dmg}` : ''}` },
        columns: [
          { id: 'name', label: 'Назва', type: 'text' },
          { id: 'school', label: 'Школа', type: 'select', options: ['Вогонь', 'Вітер', 'Земля', 'Вода', 'Розум', 'Некромантія'], width: '110px' },
          { id: 'level', label: 'Рів.', type: 'number', min: 1, max: 6, default: 1, width: '60px' },
          { id: 'cost', label: 'МВ', type: 'number', min: 0, default: 1, width: '60px' },
          { id: 'dmg', label: 'Шкода', type: 'text', placeholder: '1д8', width: '90px' },
          { id: 'range', label: 'Дальність', type: 'text', width: '100px' },
          { id: 'conc', label: 'Конц.', type: 'checkbox', width: '56px' },
        ],
        rowActions: [
          { label: 'Опис', action: 'showDesc', hint: 'Як діє закляття' },
          { label: 'Вимовити', action: 'castSpell', hint: 'Витрачає МВ і перевіряє успіх' },
          { label: 'Шкода', action: 'spellDamage' },
        ],
      }],
    },
    {
      page: 'Риси', title: 'Риси та навички', cols: 1,
      fields: [
        { id: 'traits', type: 'list', label: 'Риси', addLabel: 'Додати рису',
          pick: { title: 'Риса', label: 'Риса з бібліотеки', kind: 'kont-feats', action: 'pickFeat', meta: (e) => (e.tiers ? `рівнів: ${e.tiers.length}` : '') + (e.req ? `${e.tiers ? ' · ' : ''}вимоги: ${e.req}` : '') },
          columns: [
          { id: 'name', label: 'Назва', type: 'text', width: '30%' }, { id: 'desc', label: 'Ефект і вимоги', type: 'textarea' }] },
        { id: 'effects', type: 'list', label: 'Додаткові ефекти', addLabel: 'Додати ефект', columns: [
          { id: 'name', label: 'Назва', type: 'text', width: '30%' }, { id: 'desc', label: 'Опис', type: 'textarea' }] },
        { id: 'skills', type: 'list', label: 'Володіння навичками та інструментами', addLabel: 'Додати', columns: [
          { id: 'name', label: 'Назва', type: 'text', width: '38%' }, { id: 'desc', label: 'Бонус / примітка', type: 'textarea' }] },
        { id: 'social', type: 'list', label: 'Соціальні навички', addLabel: 'Додати', columns: [
          { id: 'name', label: 'Назва', type: 'text', width: '38%' }, { id: 'desc', label: 'Бонус / примітка', type: 'textarea' }] },
      ],
    },
    {
      page: 'Інвентар', title: 'Інвентар', cols: 4,
      fields: [
        { id: 'gold', type: 'number', label: 'Гроші (зол. монет)', min: 0, default: 0 },
        { id: 'items', type: 'list', label: 'Предмети', span: 4, addLabel: 'Додати предмет',
          pick: { title: 'Предмет', label: 'Предмет, обладунок або зілля з бібліотеки', kind: 'kont-items', action: 'pickItem', facets: [{ label: 'Розділ', get: (e) => e.cat }],
            meta: (e) => [e.cat, e.ac ? `броня ${e.ac}` : '', e.price].filter(Boolean).join(' · ') },
          columns: [
          { id: 'name', label: 'Назва', type: 'text' }, { id: 'qty', label: 'К-сть', type: 'number', default: 1, width: '70px' },
          { id: 'desc', label: 'Примітка', type: 'textarea' }] },
        { id: 'other', type: 'longtext', label: 'Інше', span: 4, rows: 3 },
      ],
    },
  ],

  // Кидки: окрема панель у головному вікні (параметри складності/бонусу — там же).
  rolls: [
    { group: 'Перевірки (d100 + мод. > складність)', items: [
      { id: 'c_free', mode: 'check', label: 'Просто d100' },
      { id: 'c_str', mode: 'check', label: 'Сила', mod: 'str_mod' },
      { id: 'c_dex', mode: 'check', label: 'Спритність', mod: 'dex_mod' },
      { id: 'c_con', mode: 'check', label: 'Статура', mod: 'con_mod' },
      { id: 'c_wil', mode: 'check', label: 'Воля', mod: 'wil_mod' },
    ] },
    { group: 'Ряткидки (d100 < характеристика)', items: [
      { id: 's_str', mode: 'save', label: 'Сила', stat: 'str_eff' },
      { id: 's_dex', mode: 'save', label: 'Спритність', stat: 'dex_eff' },
      { id: 's_con', mode: 'save', label: 'Статура', stat: 'con_eff' },
      { id: 's_wil', mode: 'save', label: 'Воля', stat: 'wil_eff' },
    ] },
    { group: 'Бій', items: [
      { id: 'init', mode: 'check', label: 'Ініціатива (d20)', die: 20, store: 'init_roll' },
      { id: 'b_block', mode: 'check', label: 'Блок удару', mod: 'dex_mod' },
      { id: 'b_shield_s', mode: 'check', label: 'Блок малим щитом', mod: 'floor(str_eff / 2.5)' },
      { id: 'b_shield_l', mode: 'check', label: 'Блок великим щитом', mod: 'floor(str_eff / 2)' },
      { id: 'b_dodge', mode: 'check', label: 'Ухилення (від заклять)', mod: 'dex_mod' },
      { id: 'b_faint', mode: 'table', label: 'Після втрати свідомості', mod: 'con_mod', table: [
        { min: 80, text: 'без поранення' }, { min: 60, text: 'легке фізичне поранення' },
        { min: 40, text: 'середнє фізичне поранення' }, { min: 20, text: 'важке фізичне поранення' },
        { min: -999, text: 'смертельне поранення' }] },
    ] },
    { group: 'Магія', items: [
      { id: 'm_duel', mode: 'check', label: 'Протистояння магів', mod: 'wil_mod' },
      { id: 'm_conc', mode: 'threshold', label: 'Концентрація (від 70)', mod: 'con_mod', min: 70 },
    ] },
  ],
};
