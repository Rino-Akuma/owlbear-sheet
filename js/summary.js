// Коротке зведення персонажа для ГМа (публікується в метадані гравця Owlbear; ліміт ≈16 КБ).
const cut = (s, n = 70) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sgn = (v) => (num(v) >= 0 ? `+${num(v)}` : String(num(v)));
const list = (items, max = 40) => items.filter(Boolean).slice(0, max).map((s) => cut(s));
const names = (rows) => arr(rows).map((r) => r && r.name).filter(Boolean);

export function buildSummary(rec, get) {
  const d = rec.data || {};
  const base = { v: 1, sys: rec.templateId, charId: rec.id, name: cut(d.name || 'Безіменний', 40), conds: arr(d.conditions).slice(0, 20), ts: Date.now() };
  base.init = d.init_roll === '' || d.init_roll === undefined || d.init_roll === null ? null : num(d.init_roll);
  if (rec.templateId === 'dnd5e') {
    return {
      ...base,
      cls: cut(arr(d.classes).filter((c) => c && c.name).map((c) => `${c.name}${c.sub ? ` (${c.sub})` : ''} ${c.level || 1}`).join(' / '), 60),
      hp: num(get('hp')), max: num(get('hp_max')), tmp: num(d.hp_temp), ac: num(d.ac), acLabel: 'КБ',
      det: {
        'Зброя': list(arr(d.attacks).filter((a) => a && a.name).map((a) => `${a.name} ${sgn(a.bonus)}${a.dmg ? ` · ${a.dmg}` : ''}`)),
        'Закляття': list(arr(d.spellbook).filter((s) => s && s.name).sort((a, b) => num(a.level) - num(b.level)).map((s) => `${s.name} (${num(s.level) === 0 ? 'замовл.' : `${num(s.level)} рів.`})`), 60),
        'Риси': list([...names(d.featlist), ...names(d.features)], 60),
        'Володіння': list([...arr(d.armor_prof), ...arr(d.weapon_prof), ...String(d.other_prof || '').split('\n').map((x) => x.trim())], 30),
      },
    };
  }
  const inj = [['л', d.inj_light], ['с', d.inj_mid], ['в', d.inj_heavy], ['см', d.inj_mortal]].filter(([, n]) => num(n) > 0).map(([k, n]) => `${k}${num(n)}`).join(' ');
  return {
    ...base,
    cls: cut(d.race || '', 60),
    hp: num(get('hp')), max: num(get('max_hp')), tmp: 0, ac: num(d.armor), acLabel: 'Обладунок', note: inj ? `Поранення: ${inj}` : '',
    det: {
      'Зброя': list(arr(d.weapons).filter((w) => w && w.name).map((w) => `${w.name}${w.base ? ` · ${w.base}` : ''}${w.coef && Number(w.coef) !== 1 ? ` ×${w.coef}` : ''}`)),
      'Закляття': list(arr(d.spells).filter((s) => s && s.name).map((s) => `${s.name}${s.school ? ` · ${s.school}` : ''} · р${num(s.level)} · МВ ${num(s.cost)}`), 60),
      'Риси': list([...names(d.traits), ...names(d.effects)], 60),
      'Володіння': list([...names(d.skills), ...names(d.social)], 40),
    },
  };
}
