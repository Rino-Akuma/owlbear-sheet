// Шаблон «D&D 5e» (редакція 2014) у стилі Long Story Short. Увесь текст — українською.
import { parseDice, rollDice } from '../engine/dice.js';
import { loadLib } from '../library.js';

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

const diceText = (d) => `${d.count}д${d.sides}${d.plus ? sign(d.plus) : ''}`;


// ---------- бібліотека: допоміжне ----------
const ABIL_UA = { str: 'Сил', dex: 'Спр', con: 'Стат', int: 'Інт', wis: 'Мдр', cha: 'Хар' };
const SIZES = { T: 'Крихітний', S: 'Малий', M: 'Середній', L: 'Великий', H: 'Величезний', G: 'Гігантський' };
const SKILL_ID = { 'sleight of hand': 'sleight', 'animal handling': 'animal' };
const SPELL_ABIL = { int: 1, wis: 2, cha: 3 };
const DMG_TYPE = { S: 'рубляча', P: 'колюча', B: 'дробна' };
const SCHOOLS = { abjuration: 'захист', conjuration: 'виклик', divination: 'віщування', enchantment: 'зачарування', evocation: 'воплощення', illusion: 'ілюзія', necromancy: 'некромантія', transmutation: 'перетворення' };
const ITEM_TYPES = { M: 'ближній бій', R: 'дальній бій', LA: 'легка броня', MA: 'середня броня', HA: 'важка броня', S: 'щит', G: 'спорядження', W: 'чарівний предмет' };
const money = (v) => (v ? `${v / 100} зм` : '');
const dnum = (e) => String(e).replace('d', 'д');
const pbOf = (ctx) => ctx.get('pb');

const libActions = {
  pickRace(ctx, e) {
    const b = Object.entries(e.ab || {}).map(([k, v]) => `${ABIL_UA[k] || k} ${v > 0 ? '+' : ''}${v}`).join(', ');
    ctx.data.race = b ? `${e.n} [${b}]` : e.n;
    ctx.data.speed = e.sp || 30;
    if (SIZES[e.sz]) ctx.data.size = SIZES[e.sz];
  },
  pickClass(ctx, e) {
    ctx.data.class = `${e.n} · к${e.hd}`;
    (e.sv || []).forEach((a) => { ctx.data[`${a}_save`] = 1; });
    if (e.sc && SPELL_ABIL[e.sc]) ctx.data.spell_abil = SPELL_ABIL[e.sc];
  },
  pickBackground(ctx, e) {
    ctx.data.background = e.n;
    (e.sk || []).forEach((k) => { ctx.data[SKILL_ID[k] || k] = Math.max(1, Number(ctx.data[SKILL_ID[k] || k]) || 0); });
  },
  pickFeat(ctx, e) { ctx.appendLine('feats', e.ab ? `${e.n} [${Object.entries(e.ab).map(([k, v]) => `${ABIL_UA[k] || k} +${v}`).join(', ')}]` : e.n); },
  async pickSpell(ctx, e) {
    let text = '';
    try { text = (await loadLib('spells-text'))[`${e.n}|${e.s}`] || ''; } catch { /* без опису */ }
    const tm = { action: 'дія', bonus: 'бонус. дія', reaction: 'реакція', minute: 'хв', hour: 'год' };
    const [num, unit] = String(e.t || '').split(' ');
    ctx.addRow('spellbook', {
      name: e.n, level: e.l, time: `${num} ${tm[unit] || unit || ''}`.trim(), range: e.r || '', dmg: e.dmg ? dnum(e.dmg) : '',
      school: SCHOOLS[e.sc] || e.sc, comps: e.c || '', dur: `${e.k ? 'концентрація, ' : ''}${e.d || ''}`, text,
    });
  },
  pickWeapon(ctx, e) {
    const str = ctx.get('str_mod'), dex = ctx.get('dex_mod');
    const fin = (e.pr || []).includes('F');
    const m = e.ty === 'R' ? dex : fin ? Math.max(str, dex) : str;
    const dm = `${dnum(e.dmg || '1')}${m ? (m > 0 ? `+${m}` : m) : ''} ${DMG_TYPE[e.dt] || ''}`.trim();
    ctx.addRow('attacks', { name: e.n, bonus: m + pbOf(ctx), dmg: dm });
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
  spellInfo(ctx, row) {
    const meta = [row.level === 0 ? 'замовляння' : `${row.level}-й рівень`, row.school, row.time, row.range, row.comps, row.dur].filter(Boolean).join(' · ');
    ctx.showText({ title: row.name || 'Закляття', meta, text: row.text || '', onSave: (v) => { row.text = v; ctx.touch(); },
      buttons: row.dmg ? [{ label: 'Кинути шкоду', primary: true, onclick: () => actions.spellDamage(ctx, row) }] : [] });
  },
  spellCast(ctx, row) {
    const n = Number(row.level) || 0;
    if (n === 0) return ctx.log({ title: `Вимовлено: ${row.name}`, lines: ['Замовляння не витрачає ячейку'], success: null, crit: null });
    const total = Number(ctx.data[`slots${n}`]) || 0;
    const left = ctx.data[`slotsleft${n}`] == null ? total : Number(ctx.data[`slotsleft${n}`]) || 0;
    if (left <= 0) return ctx.log({ title: `Вимовлено: ${row.name}`, lines: [`Немає ячейок ${n}-го рівня`], success: false, crit: null });
    ctx.setData(`slotsleft${n}`, left - 1);
    ctx.log({ title: `Вимовлено: ${row.name}`, lines: [`Ячейка ${n}-го рівня: лишилось ${left - 1} з ${total}`], success: null, crit: null });
  },
  spellDamage(ctx, row) {
    const dice = parseDice(row.dmg);
    if (!dice) return ctx.log({ title: row.name || 'Шкода', lines: ['Вкажіть шкоду кубиками, наприклад 8д6'], success: null, crit: null });
    const r = rollDice(dice);
    ctx.log({ title: `Шкода: ${row.name}`, lines: [`${diceText(dice)}: [${r.rolls.join(', ')}]${dice.plus ? ` ${sign(dice.plus)}` : ''}`], success: null, crit: null, headline: r.total });
  },
  attackRoll(ctx, row) {
    ctx.rollD20(`Атака: ${row.name || 'зброя'}`, Number(row.bonus) || 0);
  },
  damageRoll(ctx, row) {
    const dice = parseDice(row.dmg);
    if (!dice) return ctx.log({ title: row.name || 'Шкода', lines: ['Вкажіть шкоду кубиками, наприклад 1д8+3'], success: null, crit: null });
    const r = rollDice(dice);
    ctx.log({ title: `Шкода: ${row.name || 'зброя'}`, lines: [`${diceText(dice)}: [${r.rolls.join(', ')}]${dice.plus ? ` ${sign(dice.plus)}` : ''}`], success: null, crit: null, headline: r.total });
  },
  critDamage(ctx, row) {
    const dice = parseDice(row.dmg);
    if (!dice) return ctx.log({ title: row.name || 'Шкода', lines: ['Вкажіть шкоду кубиками, наприклад 1д8+3'], success: null, crit: null });
    const r = rollDice({ ...dice, count: dice.count * 2 });
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
    { id: 'spell_mod', formula: 'if(spell_abil == 1, int_mod, if(spell_abil == 2, wis_mod, if(spell_abil == 3, cha_mod, 0)))' },
    { id: 'spell_dc', formula: '8 + pb + spell_mod' },
    { id: 'spell_atk', formula: 'pb + spell_mod' },
  ],

  sections: [
    // ---------- шапка ----------
    {
      page: 'Персонаж', cols: 6, class: 'hdr',
      fields: [
        { id: 'name', type: 'text', label: 'Ім’я персонажа', span: 2, placeholder: 'Безіменний персонаж' },
        { id: 'class', type: 'text', label: 'Клас і підклас', span: 2, pick: { title: 'Клас', kind: 'classes', action: 'pickClass', meta: (e) => `к${e.hd}${e.sc ? ' · чарівник' : ''}` } },
        { id: 'race', type: 'text', label: 'Раса', span: 2, pick: { title: 'Раса', kind: 'races', action: 'pickRace', meta: (e) => `${e.sp} фт${Object.keys(e.ab || {}).length ? ' · ' + Object.entries(e.ab).map(([k, v]) => `${ABIL_UA[k] || k} +${v}`).join(' ') : ''}` } },
        { id: 'level', type: 'number', label: 'Рівень', min: 1, max: 20, default: 1 },
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
        { id: 'inspiration', type: 'checkbox', label: 'Натхнення' },
        { id: 'exhaustion', type: 'track', label: 'Виснаження', max: 6, span: 4 },
        {
          id: 'conditions', type: 'chips', label: 'Ефекти та стани', span: 4,
          options: ['Осліплений', 'Зачарований', 'Оглухлий', 'Виснажений', 'Наляканий', 'Схоплений', 'Недієздатний', 'Невидимий',
            'Паралізований', 'Скам’янілий', 'Отруєний', 'Лежачий', 'Обмежений', 'Приголомшений', 'Непритомний'],
        },
      ],
    },
    {
      page: 'Бій', title: 'Атаки', cols: 1,
      fields: [
            {
              id: 'attacks', type: 'list', addLabel: 'Додати атаку',
              pick: { title: 'Зброя', label: 'Зброя з бібліотеки', kind: 'items', action: 'pickWeapon', meta: (e) => `${e.dmg || ''} ${DMG_TYPE[e.dt] || ''} · ${e.cat || ''}`,
                facets: [{ label: 'Категорія', get: (e) => (e.cat && e.dmg && !e.mg ? e.cat : []) }] }, empty: 'Атак немає', minWidth: '480px',
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
        { id: 'spell_abil', type: 'select', label: 'Характеристика', options: [{ value: 0, label: '—' }, { value: 1, label: 'Інтелект' }, { value: 2, label: 'Мудрість' }, { value: 3, label: 'Харизма' }], default: 0 },
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
        ],
        rowActions: [
          { label: 'Опис', action: 'spellInfo', hint: 'Як діє закляття' },
          { label: 'Вимовити', action: 'spellCast', hint: 'Витрачає ячейку цього рівня' },
          { label: 'Шкода', action: 'spellDamage' },
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
            text('feats', 'Риси', { span: 2, pick: { title: 'Риса', kind: 'feats', action: 'pickFeat', meta: (e) => (e.pre ? 'є вимоги' : '') } }),
      ],
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

  pageColumns: { 'Характеристики': ['1fr', '1fr'] },

  rolls: [
    { group: 'Перевірки', items: throwRolls.map((id) => ({ id: `c_${id}`, mode: 'check', die: 20, label: abilityNames[id], mod: `${id}_mod` })) },
    { group: 'Спаскидки', items: throwRolls.map((id) => ({ id: `s_${id}`, mode: 'check', die: 20, label: `${abilityNames[id]}: спаскидок`, mod: `${id}_savemod` })) },
    { group: 'Інше', items: [
      { id: 'init', mode: 'check', die: 20, label: 'Ініціатива', mod: 'init' },
      { id: 'death', mode: 'threshold', die: 20, label: 'Спаскидок від смерті (від 10)', min: 10 },
    ] },
  ],
};

// Блоки характеристик — окремими секціями, щоб у вузькому вікні йшли в порядку Сил–Спр–Стат–Інт–Мдр–Хар
const ORDER = { str: 1, dex: 2, con: 3, int: 4, wis: 5, cha: 6, passive: 7, prof: 8 };
template.sections = template.sections.flatMap((sec) => {
  if (sec.cardClass === 'plain') return sec.fields.map((f) => ({ ...sec, fields: [f], order: ORDER[f.id] }));
  if (sec.title === 'Пасивні відчуття') return [{ ...sec, order: ORDER.passive }];
  if (sec.title === 'Володіння') return [{ ...sec, order: ORDER.prof }];
  return [sec];
});

export default template;
