# Генерує js/data/slots.json з дзеркала 5e.tools: ячейки заклять за рівнем класу, пактові ячейки чорнокнижника,
# таблиця для мультикласу і підкласи-заклиначі (Бойовий маг, Містичний шахрай).
# Запуск: python3 -I tools/build-slots.py <тека data/class з дзеркала>
import json, sys, re, os
src = sys.argv[1]
classes = json.load(open('js/data/classes.json'))
out = {'classes': {}, 'subclasses': {}, 'multi': None}
def grp(c, key='classTableGroups'):
    return [g for g in c.get(key, []) if g.get('rowsSpellProgression')]
for e in classes:
    f = os.path.join(src, 'class-%s.json' % e['n'].lower())
    if not os.path.exists(f): continue
    d = json.load(open(f))
    c = next((x for x in d['class'] if x['name'] == e['n'] and x['source'] == e['s']), None)
    if not c: continue
    prog = c.get('casterProgression')
    if prog in ('full', '1/2', 'artificer', '1/3'):
        g = grp(c)
        if g: out['classes'][e['n']] = {'prog': prog, 'tbl': g[0]['rowsSpellProgression']}
    elif prog == 'pact':
        g = c['classTableGroups'][0]; labels = g['colLabels']
        i_n = next(i for i, l in enumerate(labels) if 'Spell Slots' in l); i_l = next(i for i, l in enumerate(labels) if 'Slot Level' in l)
        rows = []
        for r in g['rows']:
            m = re.search(r'\d+', str(r[i_l])); rows.append([int(r[i_n]), int(m.group()) if m else 1])
        out['classes'][e['n']] = {'prog': 'pact', 'pact': rows}
for f in ('class-fighter.json', 'class-rogue.json'):
    d = json.load(open(os.path.join(src, f)))
    for s in d['subclass']:
        if s['source'] == 'PHB' and s.get('casterProgression') == '1/3' and s.get('subclassTableGroups'):
            g = [x for x in s['subclassTableGroups'] if x.get('rowsSpellProgression')]
            if g: out['subclasses'][s['name']] = {'prog': '1/3', 'tbl': g[0]['rowsSpellProgression']}
# таблиця мультикласу = ячейки повного заклинача за «рівнем заклинача»
out['multi'] = out['classes']['Wizard']['tbl']
json.dump(out, open('js/data/slots.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print({k: (len(v) if isinstance(v, dict) else bool(v)) for k, v in out.items()}, list(out['classes']), list(out['subclasses']))
