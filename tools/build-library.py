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
def clean(t):
    def sub(m):
        tag,body=m.group(1),m.group(2); parts=body.split('|')
        if tag in('scaledamage','scaledice'): return parts[-1] if len(parts)>2 else parts[0]
        if tag=='chance': return parts[0]+'%'
        if tag=='dc': return 'СЛ '+parts[0]
        if tag=='hit': return ('+' if not parts[0].startswith('-') else '')+parts[0]
        if tag=='h': return 'Влучання: '
        if tag in('actSave','actSaveFail','actSaveSuccess','actTrigger','actResponse'): return parts[0]
        return parts[2] if tag in('spell','item','creature','condition','skill','sense','action','filter') and len(parts)>2 and parts[2] else parts[0]
    prev=None
    while prev!=t: prev=t; t=re.sub(r'\{@(\w+)\s?([^{}]*)\}',sub,t)
    return t
SKIP_TR={'Age','Alignment','Size','Languages','Language','Ability Score Increase','Ability Score Increases'}
def traits(entries):
    out=[]
    for x in entries:
        if isinstance(x,dict) and x.get('name') and x['name'] not in SKIP_TR:
            out.append({'n':clean(x['name']),'t':'\n'.join(flat(x.get('entries',[])))})
    return out
def flat(e,depth=0):
    out=[]
    for x in e:
        if isinstance(x,str): out.append(clean(x))
        elif x.get('type')=='list': out+=['• '+(clean(i) if isinstance(i,str) else clean(' '.join(flat([i])))) for i in x['items']]
        elif x.get('type') in('entries','inset','insetReadaloud','section'):
            if x.get('name'): out.append(clean(x['name'])+'.')
            out+=flat(x.get('entries',[]))
        elif x.get('type')=='table':
            rows=[' | '.join(clean(str(c) if not isinstance(c,dict) else json.dumps(c.get('roll',c),ensure_ascii=False)) for c in r) for r in x.get('rows',[])]
            out+=[' | '.join(clean(c) for c in x.get('colLabels',[]))]+rows
        elif x.get('entries'): out+=flat(x['entries'])
    return out

# --- Раси
rd=L('races.json'); races=[]; rtx={}
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
    rtx[f"{e['n']}|{e['s']}"]=traits(r.get('entries',[]))
    for sr in rd['subrace']:
        if sr.get('raceName')==r['name'] and sr.get('raceSource')==r['source'] and sr.get('name') and ok(sr):
            a2,_=abil(sr.get('ability')); s2,_=skills(sr.get('skillProficiencies'))
            ab=dict(a)
            for k,v in a2.items(): ab[k]=ab.get(k,0)+v
            e2={'n':f"{r['name']} ({sr['name']})",'s':sr['source'],'sz':e['sz'],'sp':sr.get('speed',sp) if isinstance(sr.get('speed',sp),int) else sp,'ab':ab}
            if s+s2: e2['sk']=s+s2
            if e.get('dv') or sr.get('darkvision'): e2['dv']=sr.get('darkvision',e.get('dv'))
            races.append(e2)
            rtx[f"{e2['n']}|{e2['s']}"]=traits(r.get('entries',[]))+traits(sr.get('entries',[]))
dump('races.json',races)
dump('races-text.json',rtx)
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
# --- Описи заклять (звичайний текст, мітки 5etools прибрано)
texts={}
for f in sorted(os.listdir(os.path.join(D,'spells'))):
    if not f.startswith('spells-'): continue
    for sp in json.load(open(os.path.join(D,'spells',f),encoding='utf-8'))['spell']:
        if not ok(sp): continue
        body=flat(sp.get('entries',[]))
        if sp.get('entriesHigherLevel'): body+=['На вищих рівнях.']+flat(sp['entriesHigherLevel'][0].get('entries',[]) if isinstance(sp['entriesHigherLevel'][0],dict) else [])
        texts[f"{sp['name']}|{sp['source']}"]='\n'.join(body)
dump('spells-text.json',texts)
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
RAR_SKIP=('none',None)
for i in im:
    if not ok(i): continue
    mundane = i.get('rarity') in RAR_SKIP
    e={'n':i['name'],'s':i['source'],'ty':str(i.get('type','')).split('|')[0] or ('OTH' if mundane else 'W'),'wt':i.get('weight',0),'v':i.get('value',0)}
    if not mundane:
        e['rar']=i['rarity']; e['mg']=1
        if i.get('reqAttune'): e['at']=1
    for k,kk in (('dmg1','dmg'),('dmgType','dt'),('ac','ac'),('bonusWeapon','bw'),('bonusAc','bac')):
        if i.get(k) is not None: e[kk]=i[k]
    items.append(e)
# --- Чарівні варіанти (+1 зброя/броня, Flame Tongue тощо): розгортаємо на конкретні базові предмети
def _norm(v): return str(v).split('|')[0]
def _match(base, req):
    for k,v in req.items():
        if k=='type':
            if _norm(base.get('type'))!=_norm(v): return False
        elif k=='property':
            if _norm(v) not in [_norm(p) for p in base.get('property',[])]: return False
        elif k=='name':
            if base.get('name')!=v: return False
        elif isinstance(v,bool):
            if bool(base.get(k))!=v: return False
        else:
            if base.get(k)!=v: return False
    return True
bases=[b for b in ib['baseitem'] if ok(b)]
seen={(x['n'],x['s']) for x in items}
for mv in L('magicvariants.json')['magicvariant']:
    inh=mv.get('inherits',{})
    if mv.get('edition')=='one' or inh.get('source') not in OK or inh.get('rarity') in RAR_SKIP: continue
    for b in bases:
        if not any(_match(b,r) for r in mv.get('requires',[])): continue
        if any(_match(b,r) for r in mv.get('excludes',[]) if isinstance(r,dict)): continue
        name=f"{inh.get('namePrefix','')}{b['name']}{inh.get('nameSuffix','')}"
        if (name,inh['source']) in seen: continue
        seen.add((name,inh['source']))
        e={'n':name,'s':inh['source'],'ty':str(b.get('type','')).split('|')[0],'rar':inh['rarity'],'wt':b.get('weight',0),'v':b.get('value',0),'mg':1}
        if inh.get('reqAttune'): e['at']=1
        for k,kk in (('dmg1','dmg'),('dmgType','dt'),('ac','ac'),('weaponCategory','cat'),('range','rg')):
            if b.get(k) is not None: e[kk]=b[k]
        if b.get('property'): e['pr']=[p.split('|')[0] for p in b['property']]
        if inh.get('bonusWeapon'): e['bw']=inh['bonusWeapon']
        if inh.get('bonusAc'): e['bac']=inh['bonusAc']
        items.append(e)
dump('items.json',items)
# --- Риси, передісторії
fe=[]; ftx={}
for f in L('feats.json')['feat']:
    if not ok(f): continue
    a,ac=abil(f.get('ability')); sk_,skc_=skills(f.get('skillProficiencies')); e={'n':f['name'],'s':f['source']}
    if a: e['ab']=a
    if ac: e['abc']=ac
    if sk_: e['sk']=sk_
    if skc_: e['skc']=skc_
    pre=f.get('prerequisite')
    if pre: e['pre']=json.dumps(pre,ensure_ascii=False)
    fe.append(e)
    ftx[f"{f['name']}|{f['source']}"]='\n'.join(flat(f.get('entries',[])))
dump('feats.json',fe)
dump('feats-text.json',ftx)
bg=[]; btx={}
for b in L('backgrounds.json')['background']:
    if not ok(b): continue
    s2,sc2=skills(b.get('skillProficiencies')); e={'n':b['name'],'s':b['source']}
    if s2: e['sk']=s2
    if sc2: e['skc']=sc2
    bg.append(e)
    tr=[x for x in traits(b.get('entries',[])) if x['n'].lower().startswith('feature')]
    if tr: btx[f"{b['name']}|{b['source']}"]=tr
dump('backgrounds.json',bg)
dump('backgrounds-text.json',btx)

# --- Доповнення: підкласи, інструменти, мови, навички «будь-які»
ANY = {'anyStandard': 'будь-яка мова', 'any': 'будь-яка мова', 'anyExotic': 'екзотична мова', 'anyGamingSet': 'ігровий набір', 'anyArtisansTool': 'інструмент ремісника',
       'anyMusicalInstrument': 'муз. інструмент', 'anyTool': 'будь-який інструмент'}
def profs(lst):
    out=[]
    for e in lst or []:
        for k,v in e.items():
            if k in ANY: out.append(f"{ANY[k]} ×{v}" if v!=1 else ANY[k])
            elif v is True: out.append(k)
    return out
def merge(fname, src_list, key_fn, fields):
    arr=json.load(open(os.path.join(OUT,fname),encoding='utf-8'))
    idx={(x['n'],x['s']):x for x in arr}
    for r in src_list:
        e=idx.get(key_fn(r))
        if not e: continue
        for tgt,(sk,fn) in fields.items():
            v=fn(r.get(sk))
            if v: e[tgt]=v
    json.dump(arr,open(os.path.join(OUT,fname),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
merge('backgrounds.json',L('backgrounds.json')['background'],lambda r:(r['name'],r['source']),{'tl':('toolProficiencies',profs),'ln':('languageProficiencies',profs)})
merge('races.json',L('races.json')['race'],lambda r:(r['name'],r['source']),{'ln':('languageProficiencies',profs),'tl':('toolProficiencies',profs)})
# класи: навички «any», інструменти, підкласи
cl=json.load(open(os.path.join(OUT,'classes.json'),encoding='utf-8')); subs=[]
for f in sorted(glob.glob(os.path.join(D,'class','class-*.json'))):
    d=json.load(open(f,encoding='utf-8'))
    for c in d['class']:
        e=next((x for x in cl if x['n']==c['name'] and x['s']==c['source']),None)
        if not e: continue
        sp=c.get('startingProficiencies',{})
        for x in sp.get('skills',[]):
            if 'any' in x: e['skf']=sorted(SK); e['skc']=x['any']
        tl=profs(sp.get('toolProficiencies'))
        if tl: e['tl']=tl
    for s in d.get('subclass',[]):
        if not ok(s) or s.get('edition')=='one': continue
        o={'n':s['name'],'cls':s['className'],'s':s['source']}
        if s.get('spellcastingAbility'): o['sc']=s['spellcastingAbility']; o['pr']=s.get('casterProgression','')
        subs.append(o)
json.dump(cl,open(os.path.join(OUT,'classes.json'),'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
# прибрати дублікати (назва+клас+джерело) і підкласи без джерела з білого списку
seen=set(); uniq=[]
for o in subs:
    k=(o['n'],o['cls'],o['s'])
    if k in seen: continue
    seen.add(k); uniq.append(o)
dump('subclasses.json',uniq)
