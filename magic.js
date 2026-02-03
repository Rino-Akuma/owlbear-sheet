const levels = [
  "Заговор","1 уровень","2 уровень","3 уровень","4 уровень","5 уровень",
  "6 уровень","7 уровень","8 уровень","9 уровень"
];
const maxSlots = 12;

const container = document.getElementById("spellLevels");

levels.forEach((lvl, i)=>{
  const box = document.createElement("div");
  box.className = "spell-level";
  box.id = "level_"+i;

  const label = document.createElement("div");
  label.className = "level-label";
  label.textContent = lvl;

  const slots = document.createElement("div");
  slots.className = "slots";
  slots.id = "slots_"+i;

  const textarea = document.createElement("textarea");
  textarea.className = "spell-text";
  textarea.placeholder = "Напишите заклинания для этого уровня...";
  textarea.id = "spells_"+i;

  box.appendChild(label);
  box.appendChild(slots);
  box.appendChild(textarea);

  container.appendChild(box);
});

// === ВІКНО НАЛАШТУВАНЬ ===
const modal = document.getElementById("settingsModal");
const settingsList = document.getElementById("settingsList");

levels.forEach((lvl,i)=>{
  const row = document.createElement("div");
  row.className="modal-row";

  const label = document.createElement("span");
  label.textContent = lvl;

  const input = document.createElement("input");
  input.type="number"; input.min=0; input.max=maxSlots; input.value=0;
  input.id = "slotCount_"+i;

  input.oninput = ()=>{
    if(input.value>maxSlots) input.value=maxSlots;
    buildSlots(i, parseInt(input.value)||0);
    save();
  };

  row.appendChild(label);
  row.appendChild(input);
  settingsList.appendChild(row);
});

document.getElementById("openSettings").onclick = ()=> modal.style.display="block";
document.getElementById("closeSettings").onclick = ()=> modal.style.display="none";

function buildSlots(level,count){
  const slotBox = document.getElementById("slots_"+level);
  slotBox.innerHTML="";
  for(let i=0;i<count;i++){
    const dot = document.createElement("div");
    dot.className="slot"; dot.dataset.state="0";
    dot.onclick = ()=>{
      dot.dataset.state = dot.dataset.state=="0"?"1":"0";
      dot.classList.toggle("active", dot.dataset.state=="1");
      save();
    };
    slotBox.appendChild(dot);
  }
}

// === ФУНКЦІЯ ОБЧИСЛЕННЯ DC І АТАКИ ===
function updateMagicStats(){
  const stat = document.getElementById("spellStat").value;

  // Беремо модифікатор із листа персонажа
  const modInput = parent.document.getElementById(stat+"_mod");
  const pbInput = parent.document.getElementById("pb");

  const modVal = parseInt(modInput?.value)||0;
  const pbVal = parseInt(pbInput?.value)||0;

  document.getElementById("spellDC").textContent = 8 + modVal + pbVal;
  document.getElementById("spellAttack").textContent = modVal + pbVal;
}

// оновлення при зміні характеристики
document.getElementById("spellStat").addEventListener("change", ()=>{
  updateMagicStats();
  save();
});

// === ЗБЕРЕЖЕННЯ ===
function save(){
  let data = {spellStat: document.getElementById("spellStat").value};

  levels.forEach((_,i)=>{
    data["slotCount_"+i]=document.getElementById("slotCount_"+i).value;
    data["spells_"+i]=document.getElementById("spells_"+i).value;

    const slotStates = [];
    document.querySelectorAll("#slots_"+i+" .slot").forEach(s=>{
      slotStates.push(s.dataset.state);
    });
    data["slotStates_"+i]=slotStates;
  });

  localStorage.setItem("owlbear_magic", JSON.stringify(data));
}

// === ЗАВАНТАЖЕННЯ ===
function load(){
  const d=JSON.parse(localStorage.getItem("owlbear_magic")||"{}");
  if(d.spellStat) document.getElementById("spellStat").value = d.spellStat;

  levels.forEach((_,i)=>{
    if(d["slotCount_"+i]!==undefined){
      document.getElementById("slotCount_"+i).value=d["slotCount_"+i];
      buildSlots(i, parseInt(d["slotCount_"+i])||0);

      if(d["slotStates_"+i]){
        document.querySelectorAll("#slots_"+i+" .slot").forEach((s,idx)=>{
          if(d["slotStates_"+i][idx]=="1"){
            s.dataset.state="1";
            s.classList.add("active");
          }
        });
      }
    }

    if(d["spells_"+i]) document.getElementById("spells_"+]()
