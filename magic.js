// Рівні заклинань (0 = заговори)
const levels = [0,1,2,3,4,5,6,7,8,9];

// Максимум 12 слотів на рівень
const MAX_SLOTS = 12;

// Завантажуємо або ставимо стандарт
let slotConfig = JSON.parse(localStorage.getItem("spell_slots") || "{}");
levels.forEach(lv => {
  if(!slotConfig[lv]) slotConfig[lv] = 0;
});

// === Побудова кружечків ===
function buildSlots(){
  levels.forEach(lv=>{
    const container = document.getElementById("slots_"+lv);
    container.innerHTML = "";

    for(let i=0;i<slotConfig[lv];i++){
      const d = document.createElement("div");
      d.className = "slot";
      d.dataset.used = "0";
      d.onclick = ()=>{
        d.dataset.used = d.dataset.used=="0" ? "1" : "0";
        d.classList.toggle("filled", d.dataset.used=="1");
        saveUsedSlots();
      };
      container.appendChild(d);
    }
  });
}

// === Збереження використаних слотів ===
function saveUsedSlots(){
  let used = {};
  levels.forEach(lv=>{
    let arr = [];
    document.querySelectorAll("#slots_"+lv+" .slot").forEach((s,i)=>{
      arr[i] = s.dataset.used;
    });
    used[lv] = arr;
  });
  localStorage.setItem("spell_used", JSON.stringify(used));
}

// === Відновлення використаних слотів ===
function loadUsedSlots(){
  let used = JSON.parse(localStorage.getItem("spell_used") || "{}");

  levels.forEach(lv=>{
    const slots = document.querySelectorAll("#slots_"+lv+" .slot");
    slots.forEach((s,i)=>{
      if(used[lv] && used[lv][i]=="1"){
        s.dataset.used="1";
        s.classList.add("filled");
      }
    });
  });
}

// === Розрахунок DC та атаки ===
function recalcMagic(){
  const stat = document.getElementById("spellStat").value;

  // беремо модифікатор з основного листа
  const mod = parseInt(parent.document.getElementById(stat+"_mod")?.value || 0);
  const pb = parseInt(parent.document.getElementById("pb")?.value || 0);

  const dc = 8 + mod + pb;
  const attack = mod + pb;

  document.getElementById("spellDC").textContent = dc;
  document.getElementById("spellAttack").textContent = attack;
}

// === Налаштування слотів ===
const modal = document.getElementById("slotModal");
const settingsBox = document.getElementById("slotSettings");

function openSettings(){
  settingsBox.innerHTML = "";
  levels.forEach(lv=>{
    const row = document.createElement("div");
    row.className = "slot-config";

    row.innerHTML = `
      <div>${lv===0 ? "Заговор" : lv+" уровень"}</div>
      <input type="number" min="0" max="12" value="${slotConfig[lv]}" data-level="${lv}">
    `;
    settingsBox.appendChild(row);
  });

  modal.style.display = "block";
}

function closeSettings(){
  modal.style.display = "none";
}

document.getElementById("openSettings").onclick = openSettings;
document.getElementById("closeModal").onclick = closeSettings;

document.getElementById("saveSlots").onclick = ()=>{
  document.querySelectorAll("#slotSettings input").forEach(inp=>{
    const lv = inp.dataset.level;
    let v = parseInt(inp.value)||0;
    if(v>MAX_SLOTS) v = MAX_SLOTS;
    slotConfig[lv] = v;
  });

  localStorage.setItem("spell_slots", JSON.stringify(slotConfig));
  modal.style.display = "none";
  buildSlots();
  loadUsedSlots();
};

// === Події ===
document.getElementById("spellStat").addEventListener("change", recalcMagic);

// === Запуск ===
buildSlots();
loadUsedSlots();
recalcMagic();
