# Генерує js/data/kont-bestiary.json з текстового дампа PDF «Континенту» (розділ після стандартних бойових прийомів).
# Запуск: python3 -I tools/build-bestiary.py <kont.txt>
import re, json, sys
lines = [l.rstrip().replace('​', '') for l in open(sys.argv[1], encoding='utf-8')]
start = next(i for i, l in enumerate(lines) if l.strip().startswith('Таран -') or l.strip().startswith('Таран –')) + 1
KEYS = {'Рівень': 'lvl', 'Сила': 'str', 'Спритність': 'dex', 'Статура': 'con', 'Воля': 'wil', 'Маг. витривалість': 'mv',
        'Обладунок': 'armor', 'Зброя': 'weapon', 'ХП': 'hp', 'Риси': 'traits'}
out, cur, last = [], None, None
pending_name = None
for l in lines[start:]:
    s = l.strip()
    if not s: last = None; continue
    m = re.match(r'^(Рівень|Сила|Спритність|Статура|Воля|Маг\. витривалість|Обладунок|Зброя|ХП|Риси):\s*(.*)$', s)
    if m:
        if m.group(1) == 'Рівень':
            cur = {'n': pending_name, 's': 'Посібник'}; out.append(cur)
        cur[KEYS[m.group(1)]] = m.group(2).strip(); last = KEYS[m.group(1)]
    elif cur is not None and last in ('weapon', 'traits') and not re.search(r'^[А-ЯІЇЄҐ][а-яіїєґ’\' ]+$', s):
        cur[last] += ' ' + s
    elif cur is not None and last == 'traits' and s.islower():
        cur[last] += ' ' + s
    else:
        pending_name = s; last = None
for c in out:
    for k in ('lvl', 'str', 'dex', 'con', 'wil', 'hp', 'mv'):
        if k in c: c[k] = int(re.search(r'\d+', c[k]).group())
json.dump(out, open('js/data/kont-bestiary.json', 'w'), ensure_ascii=False, indent=0)
for c in out: print(c['n'], c.get('lvl'), c.get('hp'), '|', c.get('weapon', '')[:50], '|', c.get('traits', '')[:50])
print(len(out))
