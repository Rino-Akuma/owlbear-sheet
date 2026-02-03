// ===== ПІДТЯГУВАННЯ З STATS =====
function getModifier(stat){
  const val = parseInt(document.getElementById(stat+"_val")?.value) || 10;
  return Math.floor((val-10)/2);
}
function getPB(){ return parseInt(document.getElementById("pb")?.value)||0; }

// ===== РІВНІ ТА СЛОТИ =====
const maxSlots = 12;
const levels = [
  "Заговор","1 уровень","2 уровень","3 уровень","4 уровень",
  "5 уровень","6 уровень","7 уровень","8 уровень","9 уровень"
];

// Окремо зберігаємо:
// 1) СКІЛЬКИ СЛОТІВ Є
let slots = JSON.parse(localStorage.getItem("magicSlots") || "null") 
  ?? Array(10).fill(0);

// 2) ЯКІ СЛОТИ ЗАПОВНЕНІ (true/false)
let filledSlots = JSON.parse(localStorage.getItem("magicFilled") || "null") 
  ?? Array.from({length:10}, () => Array(12).fill(false));

const container = document.getElementById("spellContainer");

// ===== СТВОРЕННЯ РІВНІВ =====
function createLevels(){
  container.innerHTML="";

  levels.forEach((lvl,i)=>{
    const div=document.createElement("div");
    div.className="spell-level";

    const h=document.createElement("h4");
    h.textContent=lvl;
    div.appendChild(h);

    const circleContainer=document.createElement("div");

    if(i>0){ // у заговірів нема слотів
      for(let j=0;j<slots[i];j++){
        const c=document.createElement("div");
        c.className="circle";
        c.dataset.level=i;
        c.dataset.index=j;

        // Якщо цей слот був заповнений — робимо його filled
        if(filledSlots[i][j]) c.classList.add("filled");

        c.onclick = toggleCircle;
        circleContainer.appendChild(c);
      }
    }

    div.appendChild(circleContainer);

    // ===== ТЕКСТ ЗАКЛИНАНЬ =====
    const ta=document.createElement("textarea");
    ta.className="spell-text";
    ta.dataset.level=i;
    ta.placeholder="Напишите заклинание...";

    const savedText = JSON.parse(localStorage.getItem("magicText")||"{}");
    if(savedText[i]) ta.value = savedText[i];

    ta.oninput = saveAll;
    div.appendChild(ta);

    container.appendChild(div);
  });
}
createLevels();

// ===== КЛІК ПО КРУЖОЧКУ =====
function toggleCircle(e){
  const lvl = e.target.dataset.level;
  const idx = e.target.dataset.index;

  e.target.classList.toggle("filled");

  // Зберігаємо стан конкретного слота
  filledSlots[lvl][idx] = e.target.classList.contains("filled");

  saveAll();
}

// ===== ЗБЕРЕЖЕННЯ ВСЬОГО =====
function saveAll(){
  // Зберігаємо текст заклинань
  const savedText={};
  container.querySelectorAll(".spell-text").forEach(ta=>{
    savedText[ta.dataset.level] = ta.value;
  });
  localStorage.setItem("magicText", JSON.stringify(savedText));

  // Зберігаємо КІЛЬКІСТЬ слотів
  localStorage.setItem("magicSlots", JSON.stringify(slots));

  // Зберігаємо ЯКІ слоти заповнені
  localStorage.setItem("magicFilled", JSON.stringify(filledSlots));
}

// ===== ОБРАХУНОК СПАС-КИДКА І АТАКИ ЗАКЛИНАНЬ =====
const spellStat=document.getElementById("spellStat");
function recalcMagic(){
  const mod=getModifier(spellStat.value);
  const pb=getPB();
  document.getElementById("spellSave").textContent = 8+mod+pb;
  document.getElementById("spellAttack").textContent = mod+pb;
}
spellStat.addEventListener("change", recalcMagic);
recalcMagic();

// ===== НАЛАШТУВАННЯ СЛОТІВ =====
const settingsBtn=document.querySelector(".magic-settings");
const settingsPopup=document.getElementById("settingsPopup");
settingsBtn.onclick=()=> settingsPopup.style.display =
  settingsPopup.style.display=="none"?"block":"none";

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
    const lvl = inp.dataset.level;
    const newCount = Math.min(maxSlots, parseInt(inp.value)||0);

    // Якщо зменшили кількість слотів — обрізаємо масив filledSlots
    if(newCount < filledSlots[lvl].length){
      filledSlots[lvl] = filledSlots[lvl].slice(0,newCount);
    }

    // Якщо збільшили — додаємо false
    while(filledSlots[lvl].length < newCount){
      filledSlots[lvl].push(false);
    }

    slots[lvl] = newCount;
  });

  saveAll();
  createLevels();
  settingsPopup.style.display="none";
};
