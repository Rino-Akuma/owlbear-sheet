#!/usr/bin/env python3
"""Бестіарій D&D 5e (2014) з дзеркала 5etools → js/data/bestiary.json (список) і bestiary-text.json (повні блоки характеристик).
Запуск: python3 -I tools/build-bestiary-dnd.py <data 5etools>"""
import json, re, sys, os, glob
D = sys.argv[1]; OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'data')
LATE_FROM = '2024-09-17'; LATE = set()
for f, k in (('books.json', 'book'), ('adventures.json', 'adventure')):
    for x in json.load(open(os.path.join(D, f), encoding='utf-8')).get(k, []):
        if (x.get('published') or '0') >= LATE_FROM: LATE.add(x['source'])
LATE.discard('ABH')
def clean(t):
    def sub(m):
        tag, body = m.group(1), m.group(2); p = body.split('|')
        if tag in ('scaledamage', 'scaledice'): return p[-1] if len(p) > 2 else p[0]
        if tag == 'chance': return p[0] + '%'
        if tag == 'dc': return 'DC ' + p[0]
        if tag == 'hit': return ('+' if not p[0].startswith('-') else '') + p[0]
        if tag == 'h': return 'Hit: '
        if tag == 'atk': return {'mw': 'Melee Weapon Attack:', 'rw': 'Ranged Weapon Attack:', 'mw,rw': 'Melee or Ranged Weapon Attack:', 'ms': 'Melee Spell Attack:', 'rs': 'Ranged Spell Attack:', 'ms,rs': 'Melee or Ranged Spell Attack:'}.get(p[0], 'Attack:')
        if tag in ('actSave', 'actSaveFail', 'actSaveSuccess', 'actTrigger', 'actResponse', 'recharge'): return {'actSave': p[0].upper() + ' Saving Throw:', 'recharge': f'(Recharge {p[0]}-6)' if p[0] else '(Recharge 6)'}.get(tag, p[0])
        return p[2] if tag in ('spell', 'item', 'creature', 'condition', 'skill', 'sense', 'action', 'filter') and len(p) > 2 and p[2] else p[0]
    prev = None
    while prev != t: prev = t; t = re.sub(r'\{@(\w+)\s?([^{}]*)\}', sub, t)
    return t
def flat(e):
    out = []
    for x in e:
        if isinstance(x, str): out.append(clean(x))
        elif x.get('type') == 'list': out += ['• ' + (clean(i) if isinstance(i, str) else clean(' '.join(flat([i])))) for i in x['items']]
        elif x.get('type') in ('entries', 'inset', 'item'):
            if x.get('name'): out.append(clean(x['name']) + '.')
            out += flat(x.get('entries', [x['entry']] if x.get('entry') else []))
        elif x.get('type') == 'table':
            out += [' | '.join(clean(c) for c in x.get('colLabels', []))] + [' | '.join(clean(str(c)) for c in r) for r in x.get('rows', [])]
        elif x.get('entries'): out += flat(x['entries'])
    return out
SZ = {'T': 'Tiny', 'S': 'Small', 'M': 'Medium', 'L': 'Large', 'H': 'Huge', 'G': 'Gargantuan'}
AL = {'L': 'lawful', 'N': 'neutral', 'NX': 'neutral', 'NY': 'neutral', 'C': 'chaotic', 'G': 'good', 'E': 'evil', 'U': 'unaligned', 'A': 'any alignment'}
def typ(t):
    if isinstance(t, str): return t
    b = t.get('type'); b = b if isinstance(b, str) else ' '.join(b.get('choose', []))
    tg = ', '.join(x if isinstance(x, str) else x.get('tag', '') for x in t.get('tags', []))
    return b + (f' ({tg})' if tg else '')
def align(a):
    if not a: return ''
    parts = []
    for x in a:
        if isinstance(x, dict):
            if 'alignment' in x: parts.append(align(x['alignment']))
            elif x.get('special'): parts.append(x['special'])
        else: parts.append(AL.get(x, x))
    s = ' '.join(parts)
    return 'neutral' if s == 'neutral neutral' else s
def ac_txt(ac):
    out = []
    for a in ac or []:
        if isinstance(a, int): out.append(str(a))
        else: out.append(f"{a.get('ac')}" + (f" ({clean(', '.join(a['from']))})" if a.get('from') else '') + (f" {clean(a['condition'])}" if a.get('condition') else ''))
    return ', '.join(out)
def ac_num(ac):
    a = (ac or [10])[0]; return a if isinstance(a, int) else a.get('ac', 10)
def hp_txt(h):
    if not h: return ''
    return h['special'] if 'special' in h else f"{h['average']} ({h['formula']})"
def spd(s):
    out = []
    for k, v in (s or {}).items():
        if k in ('canHover', 'alternate'): continue
        n = v if isinstance(v, int) else v.get('number', 0) if isinstance(v, dict) else 0
        c = f" {clean(v['condition'])}" if isinstance(v, dict) and v.get('condition') else ''
        out.append(f"{'' if k == 'walk' else k + ' '}{n} ft.{c}")
    if s and s.get('canHover'): out[-1:] = [out[-1] + ' (hover)'] if out else []
    return ', '.join(out)
def lst(x):
    r = []
    for i in x or []:
        if isinstance(i, str): r.append(i)
        elif 'special' in i: r.append(i['special'])
        else:
            core = lst(i.get(next((k for k in ('resist', 'immune', 'vulnerable') if k in i), ''), []))
            r.append(f"{core}{' ' + i['note'] if i.get('note') else ''}")
    return ', '.join(r)
def cr_of(c):
    return c if isinstance(c, str) else (c or {}).get('cr', '0')
CRV = lambda c: {'1/8': .125, '1/4': .25, '1/2': .5}.get(c) if c in ('1/8', '1/4', '1/2') else float(c or 0)
def spl(v): return clean(', '.join(x if isinstance(x, str) else str(x.get('entry', x.get('name', ''))) for x in v))
def sc_txt(sc):
    out = []
    for s in sc or []:
        out.append(clean(s.get('name', 'Spellcasting')) + '.')
        out += flat(s.get('headerEntries', []))
        if s.get('will'): out.append('At will: ' + spl(s['will']))
        for k, v in (s.get('daily') or {}).items(): out.append(f"{k.replace('e', '/day each') if k.endswith('e') else k + '/day'}: " + spl(v))
        for lv, d in (s.get('spells') or {}).items():
            slots = f" ({d['slots']} slots)" if d.get('slots') else ''
            out.append(f"{'Cantrips (at will)' if lv == '0' else lv + ' level' + slots}: " + spl(d.get('spells', [])))
        out += flat(s.get('footerEntries', []))
    return out
def block(m):
    L = [f"{m['name']} — {', '.join(SZ.get(s, s) for s in m.get('size', ['M']))} {typ(m.get('type'))}{', ' + align(m.get('alignment')) if align(m.get('alignment')) else ''}",
         f"AC {ac_txt(m.get('ac'))} · HP {hp_txt(m.get('hp'))} · Speed {spd(m.get('speed'))}",
         ' · '.join(f"{a.upper()} {m[a]}" for a in ('str', 'dex', 'con', 'int', 'wis', 'cha') if a in m)]
    for key, lab in (('save', 'Saving Throws'), ('skill', 'Skills')):
        if m.get(key): L.append(f"{lab}: " + ', '.join(f"{k.title()} {v}" for k, v in m[key].items()))
    for key, lab in (('vulnerable', 'Damage Vulnerabilities'), ('resist', 'Damage Resistances'), ('immune', 'Damage Immunities'), ('conditionImmune', 'Condition Immunities')):
        if m.get(key): L.append(f"{lab}: " + clean(lst(m[key])))
    L.append(f"Senses: {clean(', '.join(m.get('senses') or []))}{', ' if m.get('senses') else ''}passive Perception {m.get('passive', '—')}")
    L.append('Languages: ' + (clean(', '.join(m.get('languages') or [])) or '—'))
    L.append(f"CR {cr_of(m.get('cr'))}")
    for key, lab in (('trait', 'Traits'), ('action', 'Actions'), ('bonus', 'Bonus Actions'), ('reaction', 'Reactions'), ('legendary', 'Legendary Actions'), ('mythic', 'Mythic Actions')):
        items = m.get(key)
        if key == 'trait': items = (items or [])
        if items or (key == 'trait' and m.get('spellcasting')):
            L += ['', lab.upper()]
            if key == 'trait': L += sc_txt(m.get('spellcasting')) if m.get('spellcasting') else []
            for t in items or []: L.append(clean(t['name']) + '. ' + ' '.join(flat(t.get('entries', []))))
    return '\n'.join(L)
import copy
ALL = {}
for f in sorted(glob.glob(os.path.join(D, 'bestiary', 'bestiary-*.json'))):
    for m in json.load(open(f, encoding='utf-8')).get('monster', []): ALL[(m['name'], m['source'])] = m
def sub_txt(o, rx, wh, props, top=True):
    if isinstance(o, str): return rx.sub(wh, o)
    if isinstance(o, list): return [sub_txt(x, rx, wh, props, False) for x in o]
    if isinstance(o, dict): return {k: (v if (top and props and k not in props) or k in ('name',) and top else sub_txt(v, rx, wh, props, False)) for k, v in o.items()}
    return o
def aslist(x): return x if isinstance(x, list) else [x]
def resolve(m, depth=0):
    cp = m.get('_copy')
    if not cp: return m
    base = ALL.get((cp['name'], cp['source']))
    if base is None or depth > 6: return None
    b = resolve(base, depth + 1)
    if b is None: return None
    b = copy.deepcopy(b)
    for k, v in m.items():
        if k != '_copy': b[k] = v
    for key, ops in (cp.get('_mod') or {}).items():
        for op in aslist(ops):
            if not isinstance(op, dict): continue
            mode = op.get('mode')
            if key == '*' and mode == 'replaceTxt':
                rx = re.compile(op['replace'], re.I if 'i' in op.get('flags', '') else 0)
                for k2 in list(b.keys()):
                    if k2 in ('name', 'source') or (op.get('props') and k2 not in op['props']): continue
                    b[k2] = sub_txt(b[k2], rx, op['with'].replace('$', '\\'), None, False)
                continue
            arr = b.setdefault(key, []) if key in ('trait', 'action', 'bonus', 'reaction', 'legendary', 'mythic', 'variant') else None
            if arr is None: continue
            nm = lambda x: x.get('name') if isinstance(x, dict) else x
            if mode == 'appendArr': arr += aslist(op['items'])
            elif mode == 'prependArr': arr[0:0] = aslist(op['items'])
            elif mode == 'appendIfNotExistsArr': arr += [i for i in aslist(op['items']) if nm(i) not in [nm(a) for a in arr]]
            elif mode == 'replaceArr':
                r = op.get('replace'); idx = next((i for i, a in enumerate(arr) if nm(a) == (r if isinstance(r, str) else None)), None)
                if idx is not None: arr[idx:idx + 1] = aslist(op['items'])
            elif mode == 'removeArr':
                names = op.get('names'); names = [names] if isinstance(names, str) else names or []
                arr[:] = [a for a in arr if nm(a) not in names]
            elif mode == 'insertArr': arr[op.get('index', 0):op.get('index', 0)] = aslist(op['items'])
    return b
lst_, txt = [], {}; seen = set(); nocopy = 0
for m0 in ALL.values():
    if True:
        if m0['source'] in LATE or m0.get('edition') == 'one': continue
        m = resolve(m0)
        if m is None or 'ac' not in m: nocopy += 1; continue
        k = (m['name'], m['source'])
        if k in seen: continue
        seen.add(k)
        e = {'n': m['name'], 's': m['source'], 'sz': ''.join(m.get('size', ['M'])), 'ty': typ(m.get('type')).split(' (')[0], 'cr': cr_of(m.get('cr')),
             'ac': ac_num(m.get('ac')), 'hp': (m.get('hp') or {}).get('average', 0), 'sp': (m.get('speed') or {}).get('walk', 0) if isinstance((m.get('speed') or {}).get('walk', 0), int) else (m['speed']['walk'].get('number', 0)),
             'ab': [m.get(a, 10) for a in ('str', 'dex', 'con', 'int', 'wis', 'cha')]}
        lst_.append(e); txt[f"{m['name']}|{m['source']}"] = block(m)
lst_.sort(key=lambda e: e['n'])
for name, obj in (('bestiary.json', lst_), ('bestiary-text.json', txt)):
    p = os.path.join(OUT, name); json.dump(obj, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); print(name, len(obj), os.path.getsize(p) // 1024, 'KB')
print('пропущено (_copy / без AC):', nocopy)
