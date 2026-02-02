const stats = ["str","dex","con","int","wis","cha"];
function calcPB(lvl){if(lvl<=4)return 2;if(lvl<=8)return 3;if(lvl<=12)return 4;if(lvl<=16)return 5;return 6;}
function mod(v){ return Math.floor((v-10)/2);}
const skillMap = {str:["athletics"],dex:["acrobatics","sleight","stealth"],int:["investigation","arcana","history","nature","religion"],wis:["perception","insight","medicine","survival","animal"],cha:["deception","intimidation","performance","persuasion"]};

// обмеження характеристики та рівня до 20
function clampValue(input, max=20){
  if(parseInt(input.value) > max) input.value = max;
}

// ===== Обробка натхнення (зірка) =====
const inspStar = document.getElementById("inspStar");
const inspCheckbox = document.getElementById("inspiration");
if(inspStar && inspCheckbox){
  // завантажуємо стан з localStorage
  inspStar.classList.toggle("active", inspCheckbox.checked);

  inspStar.addEventListener("click", ()=>{
    inspCheckbox.checked = !inspCheckbox.checked;
    inspStar.classList.toggle("active", inspCheckbox.checked);
    save(); // зберігаємо одразу при кліку
  });
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
  // обмежуємо рівень
  clampValue(level,20);
  let lvl=parseInt(level.value)||1;
  pb.value=calcPB(lvl);

  // модифікатори
  stats.forEach(s=>{
    clampValue(document.getElementById(s+"_val"),20);
    let v=parseInt(document.getElementById(s+"_val").value)||10;
    document.getElementById(s+"_mod").value=mod(v);
  });

  // спаскидки
  stats.forEach(s=>{
    let base=mod(parseInt(document.getElementById(s+"_val").value)||10);
    let st=document.getElementById("save_"+s).dataset.state;
    let total=base+(st=="1"?parseInt(pb.value):0);
    document.getElementById("save_"+s+"_num").textContent=total;
  });

  // навички
  Object.keys(skillMap).forEach(stat=>{
    let base=mod(parseInt(document.getElementById(stat+"_val").value)||10);
    skillMap[stat].forEach(sk=>{
      let st=document.getElementById("skill_"+sk).dataset.state;
      let bonus=0;if(st=="1") bonus=parseInt(pb.value); if(st=="2") bonus=parseInt(pb.value)*2;
      document.getElementById(sk+"_num").textContent=base+bonus;
    });
  });

  // пасивні
  let wisv=mod(parseInt(wis_val.value)||10);
  let intv=mod(parseInt(int_val.value)||10);
  pass_perception.textContent=10+wisv+(document.getElementById("skill_perception").dataset.state!="0"?parseInt(pb.value):0);
  pass_insight.textContent=10+wisv+(document.getElementById("skill_insight").dataset.state!="0"?parseInt(pb.value):0);
  pass_investigation.textContent=10+intv+(document.getElementById("skill_investigation").dataset.state!="0"?parseInt(pb.value):0);

  // ініціатива = модифікатор ловкості
  initiative.value=mod(parseInt(dex_val.value)||10);

  save();
}

// Збереження
function save(){
  let data={};
  document.querySelectorAll("input").forEach(i=>data[i.id]=i.value);
  document.querySelectorAll(".dot").forEach(d=>data[d.id]=d.dataset.state||"0");
  // натхнення теж зберігаємо
  if(inspCheckbox) data["inspiration"] = inspCheckbox.checked ? "1" : "0";
  localStorage.setItem("owlbear_sheet",JSON.stringify(data));
}

// Завантаження
function load(){
  let d=JSON.parse(localStorage.getItem("owlbear_sheet")||"{}");
  document.querySelectorAll("input").forEach(i=>{if(d[i.id]) i.value=d[i.id];});
  document.querySelectorAll(".dot").forEach(dot=>{
    if(d[dot.id]) dot.dataset.state=d[dot.id];
    dot.classList.toggle("filled", dot.dataset.state!="0");
  });
  // відновлюємо натхнення
  if(inspStar && inspCheckbox){
    inspCheckbox.checked = d["inspiration"]=="1";
    inspStar.classList.toggle("active", inspCheckbox.checked);
  }
}

document.querySelectorAll("input").forEach(i=>i.addEventListener("input", recalc));
load(); recalc();
