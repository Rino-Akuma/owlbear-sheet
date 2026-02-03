// Підтягування характеристик із stats.js
function getModifier(stat){
  const val = parseInt(document.getElementById(stat+"_val")?.value) || 10;
  return Math.floor((val-10)/2);
}
function getPB(){ return parseInt(document.getElementById("pb")?.value)||0; }

// ===== Кількість слотів =====
const maxSlots=12;
const levels=["Заговір","1 рівень","2 рівень","3 рівень","4 рівень","5 рівень","6 рівень","7 рівень","8 рівень","9 рівень"];
const defaultSlots=Array(10).fill(0);
let slots=JSON.parse(localStorage.getItem("magicSlots")||JSON.stringify(defaultSlots));

const container=document.getElementById("spellContainer");
function createLevels(){
  container.innerHTML="";
  levels.forEach((lvl,i)=>{
    const div=document.createElement("div");
    div.className="spell-level";

    const h=document.createElement("h4");
    h.textContent=lvl;
    div.appendChild(h);

    // кружечки для слотів (не для Заговору)
    const circleContainer=document.createElement("div");
    if(i>0){
      for(let j=0;j<slots[i];j++){
        const c=document.createElement("div");
        c.className="circle";
        c.dataset.level=i;
        c.dataset.index=j;
        c.onclick = toggleCircle;
        circleContainer.appendChild(c);
      }
    }
    div.appendChild(circleContainer);

    // textarea для заклинань
    const ta=document.createElement("textarea");
    ta.className="spell-text";
    ta.dataset.level=i;
    ta.placeholder="Напишіть заклинання...";
    ta.oninput=saveSpells;
    // завантажуємо з localStorage
    const saved=JSON.parse(localStorage.getItem("magicText")||"{}");
    if(saved[i]) ta.value=saved[i];
    div.appendChild(ta);

    container.appendChild(div);
  });
}
createLevels();

// ===== Слот-кружечки =====
function toggleCircle(e){
  e.target.classList.toggle("filled");
  saveSpells();
}

// ===== Збереження заклинань та кружечків =====
function saveSpells(){
  const savedText={};
  container.querySelectorAll(".spell-text").forEach(ta=>{
    savedText[ta.dataset.level]=ta.value;
  });
  localStorage.setItem("magicText", JSON.stringify(savedText));

  const savedSlots=Array(10).fill(0);
  container.querySelectorAll(".spell-level").forEach((lvlDiv,i)=>{
    savedSlots[i]=lvlDiv.querySelectorAll(".circle.filled").length;
  });
  localStorage.setItem("magicSlots", JSON.stringify(savedSlots));
}

// ===== Обрахунок спаски та атаки заклинань =====
const spellStat=document.getElementById("spellStat");
function recalcMagic(){
  const mod=getModifier(spellStat.value);
  const pb=getPB();
  document.getElementById("spellSave").textContent = 8+mod+pb;
  document.getElementById("spellAttack").textContent = mod+pb;
}
spellStat.addEventListener("change", recalcMagic);
document.querySelectorAll("input").forEach(i=>i.addEventListener("input", recalcMagic));
recalcMagic();

// ===== Налаштування слотів =====
const settingsBtn=document.querySelector(".magic-settings");
const settingsPopup=document.getElementById("settingsPopup");
settingsBtn.onclick=()=> settingsPopup.style.display = settingsPopup.style.display=="none"?"block":"none";

const slotInputs=document.getElementById("slotInputs");
function renderSlotInputs(){
  slotInputs.innerHTML="";
  levels.forEach((lvl,i)=>{
    if(i==0) return; // Заговір без слотів
    const lbl=document.createElement("label");
    lbl.textContent=lvl;
    const inp=document.createElement("input");
    inp.type="number";
    inp.min=0;
    inp.max=maxSlots;
    inp.value=slots[i];
    inp.dataset.level=i;
    lbl.appendChild(inp);
    slotInputs.appendChild(lbl);
  });
}
renderSlotInputs();

document.getElementById("saveSlots").onclick=()=>{
  document.querySelectorAll("#slotInputs input").forEach(inp=>{
    slots[inp.dataset.level]=Math.min(maxSlots,parseInt(inp.value)||0);
  });
  localStorage.setItem("magicSlots", JSON.stringify(slots));
  createLevels();
  settingsPopup.style.display="none";
};
