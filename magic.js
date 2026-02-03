// ==== Ініціалізація рівнів ====
const levelContainer = document.getElementById("level-container");
const levelNames = ["Заговор","1 рівень","2 рівень","3 рівень","4 рівень","5 рівень","6 рівень","7 рівень","8 рівень","9 рівень"];
const maxSlots = 12;

// ==== Створюємо блоки рівнів ====
levelNames.forEach((name, idx)=>{
  const box = document.createElement("div");
  box.className="level-box";

  const label = document.createElement("label");
  label.textContent=name;
  box.appendChild(label);

  // Кружечки слотів, тільки для 1-9 рівня
  if(idx>0){
    const slotContainer = document.createElement("div");
    slotContainer.className="slots";
    for(let i=0;i<maxSlots;i++){
      const slot = document.createElement("div");
      slot.className="slot";
      slot.dataset.level=idx;
      slot.dataset.index=i;
      slot.addEventListener("click", ()=>{
        slot.classList.toggle("active");
        saveMagic();
      });
      slotContainer.appendChild(slot);
    }
    box.appendChild(slotContainer);
  }

  // Текстове поле для заклинань
  const spellDiv = document.createElement("div");
  spellDiv.className="spell-text";
  const textarea = document.createElement("textarea");
  textarea.dataset.level=idx;
  textarea.addEventListener("input", saveMagic);
  spellDiv.appendChild(textarea);
  box.appendChild(spellDiv);

  levelContainer.appendChild(box);
});

// ==== Налаштування кнопки ====
const settingsBtn = document.getElementById("spell-settings-btn");
const settingsBox = document.getElementById("spell-settings");
settingsBtn.addEventListener("click", ()=>{
  settingsBox.style.display = settingsBox.style.display=="none"?"block":"none";
});

// ==== Підтягуємо значення з stats.js ====
function getMod(stat){
  const val = parseInt(document.getElementById(stat+"_val")?.value)||10;
  return Math.floor((val-10)/2);
}
function getPB(){
  return parseInt(document.getElementById("pb")?.value)||0;
}

// ==== Розрахунок Spell Save DC і Attack ====
function recalcMagic(){
  const stat = document.getElementById("spell-stat").value;
  const mod = getMod(stat);
  const pb = getPB();
  const bonus = parseInt(document.getElementById("spell-bonus").value)||0;

  document.getElementById("spell-save").value = 8 + mod + pb + bonus;
  document.getElementById("spell-attack").value = mod + pb + bonus;
}

document.getElementById("spell-stat").addEventListener("change", recalcMagic);
document.getElementById("spell-bonus").addEventListener("input", recalcMagic);

// ==== Збереження та завантаження ====
function saveMagic(){
  const data = {spells:{},slots:{}};
  levelContainer.querySelectorAll("textarea").forEach(t=>{
    data.spells[t.dataset.level] = t.value;
  });
  levelContainer.querySelectorAll(".slot").forEach(s=>{
    data.slots[`${s.dataset.level}-${s.dataset.index}`] = s.classList.contains("active")?"1":"0";
  });
  data.stat = document.getElementById("spell-stat").value;
  data.bonus = document.getElementById("spell-bonus").value;
  localStorage.setItem("owlbear_magic", JSON.stringify(data));
}

function loadMagic(){
  const data = JSON.parse(localStorage.getItem("owlbear_magic")||"{}");
  if(data.spells){
    for(let lvl in data.spells){
      const t = levelContainer.querySelector(`textarea[data-level='${lvl}']`);
      if(t) t.value=data.spells[lvl];
    }
  }
  if(data.slots){
    levelContainer.querySelectorAll(".slot").forEach(s=>{
      const key = `${s.dataset.level}-${s.dataset.index}`;
      if(data.slots[key]=="1") s.classList.add("active");
    });
  }
  if(data.stat) document.getElementById("spell-stat").value=data.stat;
  if(data.bonus) document.getElementById("spell-bonus").value=data.bonus;
  recalcMagic();
}

loadMagic();
recalcMagic();

// ==== Пов’язуємо зі змінами характеристик ====
stats.forEach(s=>{
  document.getElementById(s+"_val")?.addEventListener("input", recalcMagic);
});
document.getElementById("pb")?.addEventListener("input", recalcMagic);
