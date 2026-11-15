#!/usr/bin/env python3
"""Збирає компактну бібліотеку правил D&D 5e (2014) з дзеркала 5etools.
Запуск: python3 tools/build-library.py <шлях до 5etools-src/data>
Зберігаються лише назви й механіка (без довгих текстів книг)."""
import json, re, sys, os
D = sys.argv[1]; OUT = os.path.join(os.path.dirname(__file__), '..', 'js', 'data')
OK = {'PHB','DMG','XGE','TCE','SCAG','VGM','MTF','ERLW','EGW','GGR','MOT','AI','FTD','SCC','AAG','BGDIA','CoS','ToA','WDH','WDMM','LLK','GoS','OoW','RMBRE','TTP','CRCotN','DSotDQ','SAC','MPMM','VRGR','MM','SDW','BAM','BMT','PaBTSO','HftT','IDRotF','KftGV','LMoP','SKT','TftYP','TLK','PotA','HotDQ','RoT','OGA','LR','SLW','WBtW','CM','JttRC','QftIS','DoDk','PSA','PSI','PSK','PSD','PSX','PSZ','AWM','NRH','ABH','AZfyT','GHLoE','CC','Screen','SCREEN','Ravenloft','VD','DIP','HAT-TG','HAT-LMI','NRH-TCMC','NRH-AVitW','NRH-ASS','NRH-CoI','NRH-AWoL','NRH-TLT','SjA','SatO','MCV1SC','MCV2DC','MCV3MC','MCV4EC','LRDT','TD','ASI','HoL','TCoS','LoX','VEoR','SCREEN','DC','GotSF','GoS','KKW','DMTCRG','MFF','XMtS'}
def ok(x): return x.get('source') in OK and x.get('edition')!='one'
def dump(name, obj):
    p=os.path.join(OUT,name); json.dump(obj, open(p,'w',encoding='utf-8'), ensure_ascii=False, separators=(',',':'))
    print(name, len(obj), os.path.getsize(p)//1024, 'KB')
L = lambda f: json.load(open(os.path.join(D,f),encoding='utf-8'))
SK={'acrobatics','animal handling','arcana','athletics','deception','history','insight','intimidation','investigation','medicine','nature','perception','performance','persuasion','religion','sleight of hand','stealth','survival'}
def skills(lst):
    r=[];ch=None
    for e in lst or []:
        for k,v in e.items():
            if k in SK and v is True: r.append(k)
            elif k=='any': ch=v
            elif k=='choose': ch=v.get('count',1) if isinstance(v,dict) else None
    return r,ch
def abil(lst):
    a={};ch=None
    for e in (lst or [])[:1]:
        for k,v in e.items():
            if k=='choose': ch=v.get('count',1)
            elif k!='entry' and isinstance(v,int): a[k]=v
    return a,ch
# --- Раси
rd=L('races.json'); races=[]
for r in rd['race']:
    if not ok(r) or r.get('_isCopy') and not r.get('speed'): continue
    sp=r.get('speed',30); sp=sp.get('walk',30) if isinstance(sp,dict) else sp
    a,ac=abil(r.get('ability')); s,sc=skills(r.get('skillProficiencies'))
    e={'n':r['name'],'s':r['source'],'sz':''.join(r.get('size',['M'])),'sp':sp,'ab':a}
    if ac: e['abc']=ac
    if s: e['sk']=s
    if sc: e['skc']=sc
    if r.get('darkvision'): e['dv']=r['darkvision']
    races.append(e)
    for sr in rd['subrace']:
        if sr.get('raceName')==r['name'] and sr.get('raceSource')==r['source'] and sr.get('name') and ok(sr):
            a2,_=abil(sr.get('ability')); s2,_=skills(sr.get('skillProficiencies'))
            ab=dict(a)
            for k,v in a2.items(): ab[k]=ab.get(k,0)+v
            e2={'n':f"{r['name']} ({sr['name']})",'s':sr['source'],'sz':e['sz'],'sp':sr.get('speed',sp) if isinstance(sr.get('speed',sp),int) else sp,'ab':ab}
            if s+s2: e2['sk']=s+s2
            if e.get('dv') or sr.get('darkvision'): e2['dv']=sr.get('darkvision',e.get('dv'))
            races.append(e2)
dump('races.json',races)
# --- Класи
import glob
classes=[]
for f in sorted(glob.glob(os.path.join(D,'class','class-*.json'))):
    d=json.load(open(f,encoding='utf-8'))
    for c in d['class']:
        if not ok(c) or 'hd' not in c: continue
        sp=c.get('startingProficiencies',{}); sk=[x for x in sp.get('skills',[]) if 'choose' in x]
        e={'n':c['name'],'s':c['source'],'hd':c['hd']['faces'],'sv':c.get('proficiency',[]),
           'arm':[a if isinstance(a,str) else a.get('proficiency','') for a in sp.get('armor',[])],
           'wp':[w if isinstance(w,str) else '' for w in sp.get('weapons',[])]}
        if sk: e['skf']=sk[0]['choose']['from']; e['skc']=sk[0]['choose']['count']
        if c.get('spellcastingAbility'): e['sc']=c['spellcastingAbility']; e['pr']=c.get('casterProgression','')
        e['sub']=sorted({s['name'] for s in d.get('subclass',[]) if s.get('className')==c['name'] and ok(s)})
        classes.append(e)
dump('classes.json',classes)
# --- Закляття
src=L('spells/sources.json'); cmap={}
for _,m in src.items():
    for name,v in m.items():
        cmap.setdefault(name,set()).update(x['name'] for x in v.get('class',[]) if x.get('source') in ('PHB','TCE','XGE'))
SCH={'A':'abjuration','C':'conjuration','D':'divination','E':'enchantment','V':'evocation','I':'illusion','N':'necromancy','T':'transmutation'}
def rng(r):
    t=r.get('type'); d=r.get('distance',{})
    if t=='point': return {'self':'self','touch':'touch','sight':'sight','unlimited':'unlimited'}.get(d.get('type'), f"{d.get('amount','')} {d.get('type','')}".strip())
    return f"{t}" + (f" {d.get('amount','')} {d.get('type','')}" if d.get('amount') else '')
spells=[]
for f in sorted(os.listdir(os.path.join(D,'spells'))):
    if not f.startswith('spells-'): continue
    for s in json.load(open(os.path.join(D,'spells',f),encoding='utf-8'))['spell']:
        if not ok(s): continue
        tm=s['time'][0]; c=s.get('components',{}); cs=''.join(k.upper() for k in 'vsm' if c.get(k))
        du=s['duration'][0]; conc=bool(du.get('concentration'))
        dstr=du['type'] if du['type']!='timed' else f"{du['duration']['amount']} {du['duration']['type']}"
        txt=json.dumps(s.get('entries',[]),ensure_ascii=False)
        dm=re.findall(r'\{@(?:damage|dice) ([0-9d+ ]+)',txt)
        e={'n':s['name'],'s':s['source'],'l':s['level'],'sc':SCH.get(s['school'],s['school']),
           't':f"{tm['number']} {tm['unit']}",'r':rng(s['range']),'c':cs,'d':dstr,'cl':sorted(cmap.get(s['name'],[]))}
        if conc: e['k']=1
        if any(x.get('ritual') for x in [s.get('meta',{})]): e['rt']=1
        if dm: e['dmg']=dm[0].strip()
        if s.get('savingThrow'): e['sv']=s['savingThrow']
        if s.get('spellAttack'): e['atk']=1
        if s.get('damageInflict'): e['dt']=s['damageInflict']
        spells.append(e)
dump('spells.json',spells)
# --- Предмети
ib=L('items-base.json'); items=[]
for i in ib['baseitem']:
    if not ok(i): continue
    e={'n':i['name'],'s':i['source'],'ty':str(i.get('type','')).split('|')[0],'wt':i.get('weight',0),'v':i.get('value',0)}
    for k,kk in (('dmg1','dmg'),('dmgType','dt'),('dmg2','dmg2'),('weaponCategory','cat'),('ac','ac'),('range','rg')):
        if i.get(k) is not None: e[kk]=i[k]
    if i.get('property'): e['pr']=[p.split('|')[0] for p in i['property']]
    if i.get('stealth'): e['sth']=1
    if i.get('strength'): e['str']=i['strength']
    items.append(e)
im=L('items.json')['item']
for i in im:
    if not ok(i) or i.get('rarity') in (None,'none'): continue
    e={'n':i['name'],'s':i['source'],'ty':str(i.get('type','')).split('|')[0] or 'W','rar':i['rarity'],'wt':i.get('weight',0),'v':i.get('value',0),'mg':1}
    if i.get('reqAttune'): e['at']=1
    for k,kk in (('dmg1','dmg'),('dmgType','dt'),('ac','ac'),('bonusWeapon','bw'),('bonusAc','bac')):
        if i.get(k) is not None: e[kk]=i[k]
    items.append(e)
dump('items.json',items)
# --- Риси, передісторії
fe=[]
for f in L('feats.json')['feat']:
    if not ok(f): continue
    a,ac=abil(f.get('ability')); e={'n':f['name'],'s':f['source']}
    if a: e['ab']=a
    if ac: e['abc']=ac
    pre=f.get('prerequisite')
    if pre: e['pre']=json.dumps(pre,ensure_ascii=False)
    fe.append(e)
dump('feats.json',fe)
bg=[]
for b in L('backgrounds.json')['background']:
    if not ok(b): continue
    s,sc=skills(b.get('skillProficiencies')); e={'n':b['name'],'s':b['source']}
    if s: e['sk']=s
    if sc: e['skc']=sc
    bg.append(e)
dump('backgrounds.json',bg)
