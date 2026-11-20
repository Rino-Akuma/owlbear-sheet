#!/usr/bin/env python3
"""Збирає бібліотеку «Континенту» з Excel-анкети та PDF «Посібник по Континенту».

Запуск:  python3 tools/build-kontynent.py <анкета.xlsx> <посібник.pdf>
Результат: js/data/kont-*.json  (spells, weapons, items, feats, races, backgrounds)
Потрібні: openpyxl, pdftotext (poppler).
"""
import json, re, subprocess, sys, pathlib, datetime
import openpyxl

XLSX, PDF = sys.argv[1], sys.argv[2]
OUT = pathlib.Path(__file__).resolve().parent.parent / 'js' / 'data'
SRC = 'Посібник'


def dump(name, data):
    (OUT / f'kont-{name}.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(name, len(data))


def clean(s):
    if s is None:
        return ''
    return re.sub(r'[ \t]+', ' ', str(s).replace('​', '')).strip()


def num(v, default=0):
    try:
        f = float(v)
        return int(f) if f == int(f) else f
    except (TypeError, ValueError):
        return default


wb = openpyxl.load_workbook(XLSX, data_only=True)

# ---------------- закляття ----------------
SCHOOL = {'вогню': 'Вогонь', 'вітру': 'Вітер', 'землі': 'Земля', 'води': 'Вода', 'розуму': 'Розум', 'некромантії': 'Некромантія'}
ws = wb['Стандартні закляття']
spells = []
for col0 in (4, 16):  # блоки D..L та P..X
    school = ''
    for r in range(1, ws.max_row + 1):
        c = [ws.cell(r, col0 + i).value for i in range(9)]
        if isinstance(c[0], str) and c[0].startswith('Школа'):
            school = SCHOOL.get(c[0].replace('Школа', '').strip().lower(), c[0])
            continue
        if not isinstance(c[0], (int, float)) or not c[1]:
            continue
        desc = clean(c[8])
        dlc = 'DLC' in desc
        desc = re.sub(r'\s*\(DENIS DLC EDITION\)', '', desc).strip()
        spells.append({
            'n': clean(c[1]), 's': 'DLC' if dlc else SRC, 'sch': school, 'l': int(c[0]),
            'rng': clean(c[2]), 'ty': clean(c[3]), 'dmg': '' if clean(c[4]) in ('-', '') else clean(c[4]),
            'dur': '' if clean(c[5]) == '-' else clean(c[5]),
            'conc': clean(c[6]).lower().startswith('т'),
            'cost': num(c[7], 1), 'desc': desc,
        })
spells.sort(key=lambda x: (x['sch'], x['l'], x['n']))
dump('spells', spells)

# ---------------- зброя ----------------
ws = wb['Стандартна зброя']
weapons = []
cur = None
for r in range(5, ws.max_row + 1):
    name, kind, fenc, dmg, stat, size, coef, price, note = [ws.cell(r, 4 + i).value for i in range(9)]
    if not (name or dmg):
        continue
    if isinstance(coef, (datetime.datetime, datetime.date)):
        coef = 1.5  # «1.5» Excel прочитав як дату 1 травня
    coef_txt = clean(coef)
    if name:
        cur = {'n': clean(name), 's': SRC, 'dt': clean(kind), 'fenc': clean(fenc).lower().startswith('т'),
               'price': clean(price), 'note': clean(note), 'g': []}
        weapons.append(cur)
    elif cur is not None:
        # рядок-варіант (інший хват) успадковує те, що не вказано
        kind = kind or cur['dt']
    m = re.search(r'(Одноруч|Двуруч)\s*(\d+\s*[кдkd]\s*\d+)', clean(dmg))
    if not m:
        continue
    st = clean(stat) or (cur['g'][-1]['st'] if cur['g'] else 'СИЛ')
    coef_v = 1.0
    mc = re.match(r'^[\d.]+', coef_txt)
    if mc:
        coef_v = float(mc.group(0))
    cur['g'].append({'h': 1 if m.group(1) == 'Одноруч' else 2, 'dmg': re.sub(r'\s+', '', m.group(2)).replace('к', 'д').replace('k', 'д').replace('d', 'д'),
                     'st': st, 'sz': clean(size), 'k': coef_v, 'kt': coef_txt if not re.match(r'^[\d.]+$', coef_txt) else ''})
dump('weapons', weapons)

# ---------------- спорядження + алхімія ----------------
items = []
ws = wb['Стандартне спорядження']
cat = ''
for r in range(5, ws.max_row + 1):
    if ws.cell(r, 3).value:
        cat = clean(ws.cell(r, 3).value)
    name, req, ac, bonus, limit, price, desc = [ws.cell(r, 4 + i).value for i in range(7)]
    if not name:
        continue
    items.append({'n': clean(name), 's': SRC, 'cat': cat, 'req': '' if clean(req) == '-' else clean(req),
                  'ac': num(ac, 0) if clean(ac) not in ('', '-') else 0,
                  'bonus': '' if clean(bonus) == '-' else clean(bonus), 'limit': '' if clean(limit) == '-' else clean(limit),
                  'price': clean(price), 'desc': clean(desc)})
ws = wb['Алхімія']
for r in range(5, ws.max_row + 1):
    name, cost, skill, equip, rare, eff = [ws.cell(r, 4 + i).value for i in range(6)]
    if not name or not eff:
        continue
    rare_t = '' if clean(rare) in ('Немає', '') else clean(rare)
    items.append({'n': clean(name), 's': SRC, 'cat': 'Алхімія', 'req': '', 'ac': 0, 'bonus': '', 'limit': '',
                  'price': clean(cost), 'desc': clean(eff),
                  'alc': {'skill': clean(skill), 'equip': clean(equip), 'rare': rare_t}})
dump('items', items)

# ---------------- текст PDF ----------------
raw = subprocess.run(['pdftotext', '-layout', PDF, '-'], capture_output=True, text=True, check=True).stdout
pages = [p.replace('​', '') for p in raw.split('\f')]


def page_text(a, b):  # номери сторінок з 1, включно
    return '\n'.join(pages[a - 1:b])


# ---------------- риси ----------------
ft = page_text(39, 46)
ft = ft[ft.index('Список рис') + len('Список рис'):]
lines = ft.split('\n')
feats = []
expect = 1
curf = None
for ln in lines:
    m = re.match(r'^\s*(\d{1,2})\.\s*(\S.*?)\s*$', ln)
    if m and int(m.group(1)) in (expect, expect + 1) and len(m.group(2)) < 60 and not m.group(2).startswith('Ефект'):
        expect = int(m.group(1)) + 1
        curf = {'n': m.group(2), 'raw': []}
        feats.append(curf)
        continue
    if curf is not None:
        curf['raw'].append(ln)
out = []
for f in feats:
    body = re.sub(r'\n\s*\n', '\n', '\n'.join(f['raw'])).strip()
    body = re.sub(r'[ \t]+', ' ', body)
    i = body.find('Ефект:')
    j = body.rfind('Вимоги:')
    eff = body[i + 6:j].strip() if j > i else body[i + 6:].strip()
    req = body[j + 7:].strip() if j > -1 else ''
    eff = re.sub(r'\s*\n\s*', ' ', eff).replace('. Додатково', '.\nДодатково')
    if f['n'] == 'Майстерність у школі магії':
        eff = re.sub(r'\s*\n\s*(Школа )', r'\n\1', re.sub(r'(?<!\n)\s*\n\s*(?!Школа)', ' ', body[i + 6:j].strip()))
    req = re.sub(r'\s*\n\s*', ' ', req).strip()
    out.append({'n': f['n'], 's': SRC, 'eff': eff, 'req': '' if req in ('—', '-', '') else req})
# рівні (+5 / +10 / +20): масив значень, якщо вони є
TIER = re.compile(r'(?<![\w.])([+\-×]?\d+(?:[.,]\d+)?)((?:\s*/\s*[+\-×]?\d+(?:[.,]\d+)?)+)')
for f in out:
    m = TIER.search(f['eff'].split('\n')[0])
    if m:
        vals = [m.group(1)] + [x.strip() for x in m.group(2).split('/') if x.strip()]
        f['tiers'] = vals
        f['tspan'] = [m.start(), m.end()]
for f in out:
    if f['n'] == 'Стійкість концентрації':
        f['tiers'] = ['+5', '+10', '+15', '+20', 'автоуспіх']
        f['tspan'] = [8, f['eff'].index(' ', 8) if ' ' in f['eff'][8:] else len(f['eff'])]
        f['tspan'] = [f['eff'].index('+5'), f['eff'].index('автоуспіх') + len('автоуспіх')]
    if f['n'] == 'Покращена агресивна стійка':
        f.pop('tiers', None); f.pop('tspan', None)
dump('feats', out)
print([f['n'] for f in out][:5], '...', len(out))

# ---------------- раси ----------------
rt = page_text(47, 49)
rt = rt[rt.index('Людина'):]
rt = re.sub(r'\n\s*\n', '\n\n', rt)
paras = [re.sub(r'\s*\n\s*', ' ', p).strip() for p in rt.split('\n\n') if p.strip()]
# склеїти абзаци, що розірвані розривом сторінки: новий абзац починається з «Назва — »
merged = []
for p in paras:
    if re.match(r'^(Людина|Ельф|Гноми|Орки|Велетні|Інферніти|Невмерлі|Драконіди|Напівкровки)\b', p) or not merged:
        merged.append(p)
    else:
        merged[-1] += ' ' + p
RACES = {
    'Людина': dict(st={}, fx=[('Універсальність', '+1 додаткова риса на початку гри')]),
    'Ельф': dict(st={'wil': 5, 'str': -10, 'con': -5}, fx=[('Максимум Волі 120', 'Ельфи можуть підняти Волю до 120.')]),
    'Гноми': dict(st={'con': 10, 'dex': -10}, fx=[
        ('Стійкість до магії', 'Перевага при перевірках проти магічного впливу.'),
        ('Нездатні до магії', 'Гноми не можуть повноцінно чаклувати (зате монополізували ремесло зачарування).')]),
    'Орки': dict(st={'str': 10, 'dex': 5}, fx=[
        ('Максимум Сили 120', 'Орки можуть підняти Силу до 120.'),
        ('Слабка воля', 'Перешкода на перевірки Волі.'),
        ('Регенерація', 'Легкі поранення загоюються самі, погіршення інших травм — вдвічі повільніше.'),
        ('Живучість орка', 'При смертельному пораненні раз на добу d20: 13+ — поранення знижується до важкого.')]),
    'Велетні': dict(st={'str': 30, 'con': 30, 'dex': -10}, fx=[
        ('Максимум Сили й Статури 200', 'Максимум Сили та Статури — 200. Взаємозалежність характеристик діє між Силою і Статурою.'),
        ('Очки втричі', 'Вкладення очок у Силу й Статуру зараховуються утричі більше.'),
        ('Незграбність', 'Перешкода на всі небойові перевірки та проти дальнобійних атак.'),
        ('Міцне тіло', 'Перевага на перевірки Статури.'),
        ('Регенерація', 'Легкі й середні поранення гояться самі; при тяжких і смертельних тричі на день d20: 13+ — ступінь знижується на один.')]),
    'Інферніти': dict(st={'str': 5, 'dex': 5, 'con': 5, 'wil': 5}, mv=10, fx=[
        ('Максимум характеристик 110', 'Максимум кожної характеристики — 110.'),
        ('Вогняна природа', 'Імунітет до шкоди вогнем; немагічні класи можуть користуватись заклять школи вогню.'),
        ('Стійкість', 'Імунітет до більшості отрут і хвороб.')]),
    'Невмерлі': dict(st={}, fx=[
        ('Невмерлий', 'Не може померти звичайним способом; не потребує їжі, води чи сну, але потребує підживлення енергією живих. Остаточно знищити можна лише спаленням тіла або звільненням душі. Конкретні переваги й недоліки визначає майстер.')]),
    'Драконіди': dict(st={'dex': 10}, armor=10, fx=[
        ('Максимум Спритності 120', 'Драконіди можуть підняти Спритність до 120.'),
        ('Контроль тіла й психіки', 'Перевага на перевірки Статури й Волі.'),
        ('Луска', 'Не носять обладунків; вбудовані 10 броні, що зростає на 1,5 за кожен рівень (округлення вниз).'),
        ('Пазурі', 'Фехтувальна зброя, 1д8. Коефіцієнт: 0.5 (рівні 0–8), 1 (9–15), 1.5 (16–20).'),
        ('Кістки лікування', 'd10 на кожному парному рівні; витрачаються на відновлення HP чи лікування поранень, відновлюються після довгого відпочинку. Єдина раса, що володіє лікувальною магією.'),
        ('Стійкість', 'Імунітет до більшості отрут і хвороб.')]),
    'Напівкровки': dict(st={}, fx=[('Напівкровка', 'Поєднує риси двох рас; успадкування визначається кидками (нездатність до магії у гномів — домінантна).')]),
}
races = []
for p in merged:
    name = re.match(r'^\S+', p).group(0)
    d = RACES.get(name)
    if not d:
        print('!! раса без даних:', name)
        continue
    races.append({'n': name, 's': SRC, 'desc': p, 'st': d['st'], 'mv': d.get('mv', 0), 'armor': d.get('armor', 0),
                  'fx': [{'name': a, 'desc': b} for a, b in d['fx']]})
# Інферніти й невмерлі — не раси, а риси: ними можна стати з будь-якою расою чи напівкровкою
MOVED = {'Інферніти': 'Інферніт', 'Невмерлі': 'Невмерлий'}
for r in [r for r in races if r['n'] in MOVED]:
    out.append({'n': MOVED[r['n']], 's': SRC, 'eff': r['desc'], 'req': 'доступна будь-якій расі та напівкровці; бонуси додаються поверх базової раси',
                'st': r['st'], 'mv': r['mv'], 'armor': r['armor'], 'fx': r['fx']})
races = [r for r in races if r['n'] not in MOVED]
dump('races', races)
dump('feats', out)

# ---------------- передісторії ----------------
bt = page_text(51, 54)
bt = bt[bt.index('Стандартні передісторії'):]
BG_NAMES = None
entries = re.split(r'\n\s*(?=\d{1,2}\.\s*\S)', bt)[1:]
SUB = {
    'Лору і історії': 'Лор і історія', 'Теорії та освіти': 'Теорія та освіта', 'Аналітики і логіки': 'Аналітика і логіка',
    'Заборонених знань': 'Заборонені знання', 'Дипломатії': 'Дипломатія', 'Тиску': 'Тиск', 'Обману': 'Обман',
    'Торгівлі': 'Торгівля', 'Проникливості': 'Проникливість', 'Витривалості': 'Витривалість',
    'Обходу небезпек': 'Обхід небезпек', 'Обхід небезпек': 'Обхід небезпек', 'Навичок виживання': 'Навички виживання',
    'Навичках виживання': 'Навички виживання', 'Спостереження': 'Спостереження', 'Слуху і відчуттів': 'Слух і відчуття',
    'Оцінка загроз': 'Оцінка загроз', 'Прихованого руху': 'Прихований рух', 'Злочинної майстерності': 'Злочинна майстерність',
    'Приховування слідів': 'Приховування слідів',
    'Ювелірної справи': 'Ювелірна справа', 'Військової стратегії і тактики': 'Військова стратегія і тактика',
    'Медицини': 'Медицина', 'Алхімії': 'Алхімія', 'Ковальство': 'Ковальство', 'Інженерії': 'Інженерія',
    'Зачарування': 'Зачарування', 'Писарства': 'Писарство',
}
CATS = ['Знання', 'Соціальність', 'Фізичні', 'Непомітність', 'Сприйняття і уважність', 'Ремесло']
bgs = []
for e in entries:
    e = re.sub(r'\s+', ' ', e).strip()
    m = re.match(r'^(\d{1,2})\.\s*(.+?):\s*(.*)$', e)
    if not m:
        continue
    name, rest = m.group(2), m.group(3)
    # опис — до першого сегмента, що починається з назви групи
    pos = min([rest.find(c + ' +') for c in CATS if rest.find(c + ' +') >= 0] + [rest.find(c + ':') for c in CATS if rest.find(c + ':') >= 0] + [10 ** 6])
    desc, mech = rest[:pos].strip(), rest[pos:].strip()
    grants = []  # {cat, b, subs:[[name,b]]}
    cut = [m.start() for m in re.finditer(r'(?:Знання|Соціальність|Фізичні|Непомітність|Сприйняття і уважність|Ремесло)(?=\s*[+:])', mech)]
    for seg in [mech[a:b] for a, b in zip(cut, cut[1:] + [len(mech)])]:
        seg = seg.strip().rstrip(';').rstrip('.').strip()
        seg = seg.strip().rstrip('.')
        if not seg:
            continue
        mc = re.match(r'^(Знання|Соціальність|Фізичні|Непомітність|Сприйняття і уважність|Ремесло)\s*:?\s*(.*)$', seg)
        if not mc:
            print('!! сегмент', name, '|', seg)
            continue
        cat, tail = mc.group(1), mc.group(2).strip()
        if cat == 'Ремесло':
            mm = re.match(r'^\+(\d+)\s*до\s*(.+)$', tail)
            opts = [SUB.get(x.strip(), x.strip()) for x in re.split(r'\s+або\s+', mm.group(2))] if mm else []
            if not mm:
                print('!! ремесло', name, tail)
            grants.append({'cat': 'Ремесло', 'b': int(mm.group(1)) if mm else 0, 'subs': [[o, int(mm.group(1))] for o in opts], 'any': len(opts) > 1})
            continue
        mb = re.match(r'^(?:\+(\d+))?\s*:?\s*(?:\((.*)\))?\s*\.?$', tail)
        if not mb:
            print('!! група', name, '|', tail)
            continue
        subs = []
        if mb.group(2):
            for part in mb.group(2).split(','):
                ms = re.match(r'^\s*\+(\d+)\s*до\s*(.+?)\s*$', part)
                if ms:
                    nm = ms.group(2)
                    if nm not in SUB.values() and nm not in SUB:
                        print('!! невідома підгрупа', name, nm)
                    subs.append([SUB.get(nm, nm), int(ms.group(1))])
        grants.append({'cat': cat, 'b': int(mb.group(1)) if mb.group(1) else 0, 'subs': subs})
    bgs.append({'n': name, 's': SRC, 'desc': desc, 'g': grants})
dump('backgrounds', bgs)
