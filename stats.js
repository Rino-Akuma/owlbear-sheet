const stats = ["str","dex","con","int","wis","cha"];

function calcPB(lvl){
  if(lvl<=4)return 2;
  if(lvl<=8)return 3;
  if(lvl<=12)return 4;
  if(lvl<=16)return 5;
  return 6;
}
function mod(v){ return Math.floor((v-10)/2);}

const skillMap = {
  str:["athletics"],
  dex:["acrobatics","sleight","stealth"],
  int:["investigation","arcana","history","nature","religion"],
  wis:["perception","insight","medicine","survival","animal"],
  cha:["deception","intimidation","performance","persuasion"]
};

// ======== МОВА ========
function applyStatsLanguage(){
  if(!window.LANG || !window.LANG.stats) return;
  const L = window.LANG.stats;

  document.getElementById("stats_title").textContent = L.title;

  document.getElementById("lbl_name").textContent = L.name;
  document.getElementById("lbl_class").textContent = L.class;
  document.getElementById("lbl_subclass").textContent = L.subclass;
  document.getElementById("lbl_race").textContent = L.race;
  document.getElementById("lbl_level").textContent = L.level;
  document.getElementById("lbl_pb").textContent = L.pb;
  document.getElementById("lbl_inspiration").textContent = L.inspiration;

  document.getElementById("lbl_hp").textContent = L.hp;
  document.getElementById("lbl_maxhp").textContent = L.maxhp;
  document.getElementById("lbl_temphp").textContent = L.temphp;
  document.getElementById("lbl_ac").textContent = L.ac;
  document.getElementById("lbl_initiative").textContent = L.initiative;
  document.getElementById("lbl_move").textContent = L.move;
  document.getElementById("lbl_swim").textContent = L.swim;

  document.getElementById("title_str").textContent = L.str;
  document.getElementById("title_dex").textContent = L.dex;
  document.getElementById("title_con").textContent = L.con;
  document.getElementById("title_int").textContent = L.int;
  document.getElementById("title_wis").textContent = L.wis;
  document.getElementById("title_cha").textContent = L.cha;

  document.getElementById("text_save_str").textContent = L.save_str;
  document.getElementById("text_save_dex").textContent = L.save_dex;
  document.getElementById("text_save_con").textContent = L.save_con;
  document.getElementById("text_save_int").textContent = L.save_int;
  document.getElementById("text_save_wis").textContent = L.save_wis;
  document.getElementById("text_save_cha").textContent = L.save_cha;

  document.getElementById("text_athletics").textContent = L.athletics;
  document.getElementById("text_acrobatics").textContent = L.acrobatics;
  document.getElementById("text_sleight").textContent = L.sleight;
  document.getElementById("text_stealth").textContent = L.stealth;
  document.getElementById("text_investigation").textContent = L.investigation;
  document.getElementById("text_arcana").textContent = L.arcana;
  document.getElementById("text_history").textContent = L.history;
  document.getElementById("text_nature").textContent = L.nature;
  document.getElementById("text_religion").textContent = L.religion;
  document.getElementById("text_perception").textContent = L.perception;
  document.getElementById("text_insight").textContent = L.insight;
  document.getElementById("text_medicine").textContent = L.medicine;
  document.getElementById("text_survival").textContent = L.survival;
  document.getElementById("text_animal").textContent = L.animal;
  document.getElementById("text_deception").textContent = L.deception;
  document.getElementById("text_intimidation").textContent = L.intimidation;
  document.getElementById("text_performance").textContent = L.performance;
  document.getElementById("text_persuasion").textContent = L.persuasion;

  document.getElementById("passive_title").textContent = L.passive_title;
  document.getElementById("lbl_pass_perception").textContent = L.pass_perception;
  document.getElementById("lbl_pass_insight").textContent = L.pass_insight;
  document.getElementById("lbl_pass_investigation").textContent = L.pass_investigation;
}

// слухаємо зміну мови від index.html
document.addEventListener("langChanged", ()=> applyStatsLanguage());

// ======== ТВОЯ ЛОГІКА БЕЗ ЗМІН ========

function clampValue(input, max=20){
  if(parseInt(input.value)>max) input.value=max;
}

document.querySelectorAll(".dot").forEach(dot=>{
  dot.dataset.state="0";
  dot.onclick=()=>{
    if(dot.id.startsWith("save_")) dot.dataset.state = dot.dataset.state=="0"?"1":"0";
    else dot.dataset.state = (parseInt(dot.dataset.state)+1)%3;
    dot.classList.toggle("filled", dot.dataset.state!="0");
    recalc();
  }
});

function recalc(){
  clampValue(level,20);
  let lvl=parseInt(level.value)||1;
  pb.value=calcPB(lvl);

  stats.forEach(s=>{
    clampValue(document.getElementById(s+"_val"),20);
    let v=parseInt(document.getElementById(s+"_val").value)||10;
    document.getElementById(s+"_mod").value=mod(v);
  });

  stats.forEach(s=>{
    let base=mod(parseInt(document.getElementById(s+"_val").value)||10);
    let st=document.getElementById("save_"+s).dataset.state;
    let total=base+(st=="1"?parseInt(pb.value):0);
    document.getElementById("save_"+s+"_num").textContent=total;
  });

  Object.keys(skillMap).forEach(stat=>{
    let base=mod(parseInt(document.getElementById(stat+"_val").value)||10);
    skillMap[stat].forEach(sk=>{
      let st=document.getElementById("skill_"+sk).dataset.state;
      let bonus=0;
      if(st=="1") bonus=parseInt(pb.value);
      if(st=="2") bonus=parseInt(pb.value)*2;
      document.getElementById(sk+"_num").textContent=base+bonus;
    });
  });

  let wisv=mod(parseInt(wis_val.value)||10);
  let intv=mod(parseInt(int_val.value)||10);

  pass_perception.textContent = 10+wisv+
    (document.getElementById("skill_perception").dataset.state!="0"?parseInt(pb.value):0);

  pass_insight.textContent = 10+wisv+
    (document.getElementById("skill_insight").dataset.state!="0"?parseInt(pb.value):0);

  pass_investigation.textContent = 10+intv+
    (document.getElementById("skill_investigation").dataset.state!="0"?parseInt(pb.value):0);

  initiative.value=mod(parseInt(dex_val.value)||10);
  save();
}

function save(){
  let data={};
  document.querySelectorAll("input").forEach(i=>data[i.id]=i.value);
  document.querySelectorAll(".dot").forEach(d=>data[d.id]=d.dataset.state||"0");
  localStorage.setItem("owlbear_sheet",JSON.stringify(data));
}

function load(){
  let d=JSON.parse(localStorage.getItem("owlbear_sheet")||"{}");
  document.querySelectorAll("input").forEach(i=>{if(d[i.id]) i.value=d[i.id];});
  document.querySelectorAll(".dot").forEach(dot=>{
    if(d[dot.id]) dot.dataset.state=d[dot.id];
    dot.classList.toggle("filled", dot.dataset.state!="0");
  });
}

document.querySelectorAll("input").forEach(i=>i.addEventListener("input", recalc));
load();
recalc();

// застосовуємо мову при першому завантаженні
setTimeout(applyStatsLanguage, 50);
