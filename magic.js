const spellLevels = ["Заговір","1 рівень","2 рівень","3 рівень","4 рівень","5 рівень","6 рівень","7 рівень","8 рівень","9 рівень"];
const maxCircles = 12;
let circlesPerLevel = Array(10).fill(12); // дефолт 12 кружечків

const spellStatSelect = document.getElementById("spellStat");
const spellSaveSpan = document.getElementById("spellSave");
const spellAttackSpan = document.getElementById("spellAttack");
const spellLevelsContainer = document.getElementById("spellLevels");

// Кнопка налаштувань
document.getElementById("magicSettingsBtn").addEventListener("click", ()=>{
  const settings = document.getElementById("magicSettings");
  settings.style.display = settings.style.display === "none" ? "block" : "none";
});

// Генеруємо налаштування кружечків
const levelSettingsDiv = document.getElementById("levelCirclesSettings");
spellLevels.forEach((lvl,i)=>{
  const div = document.createElement("div");
  div.innerHTML = `<label>${lvl} кількість кружечків: <input type="number" min="0" max="${maxCircles}" value="${circlesPerLevel[i]}" data-level="${i}"></label>`;
  levelSettingsDiv.appendChild(div);
});

// Зберегти налаштування кружечків
document.getElementById("saveMagicSettings").addEventListener("click", ()=>{
  document.querySelectorAll("#levelCirclesSettings input").forEach(input=>{
    const i = parseInt(input.dataset.level);
    circlesPerLevel[i] = Math.min(maxCircles, Math.max(0, parseInt(input.value)||0));
  });
  generateSpellLevels();
});

// Генеруємо поля заклинань і кружечки
function generateSpellLevels(){
  spellLevelsContainer.innerHTML = "";
  spellLevels.forEach((lvl,i)=>{
    const div = document.createElement("div");
    div.classList.add("spell-level");

    // header: назва рівня + кружечки
    const header = document.createElement("div");
    header.classList.add("level-header");
    header.innerHTML = `<span>${lvl}</span>`;
    const circlesDiv = document.createElement("div");
    for(let c=0;c<circlesPerLevel[i];c++){
      const circle = document.createElement("span");
      circle.classList.add("circle");
      circle.dataset.state = "0";
      circle.addEventListener("click", ()=>{
        circle.dataset.state = circle.dataset.state==="0"?"1":"0";
        circle.classList.toggle("active", circle.dataset.state==="1");
      });
      circlesDiv.appendChild(circle);
    }
    header.appendChild(circlesDiv);
    div.appendChild(header);

    // input для назви заклинання
    const spellInput = document.createElement("input");
    spellInput.classList.add("spell-name");
    spellInput.placeholder = "Назва заклинання";
    div.appendChild(spellInput);

    spellLevelsContainer.appendChild(div);
  });
}

// Підрахунок спелл атаки і спелл сейву
function recalcSpell(){
  const stat = spellStatSelect.value;
  const modVal = parseInt(document.getElementById(stat+"_mod").value)||0;
  const pbVal = parseInt(document.getElementById("pb").value)||0;
  const extra = parseInt(document.getElementById("spellExtra")?.value)||0;

  spellSaveSpan.textContent = 8 + modVal + pbVal + extra;
  spellAttackSpan.textContent = modVal + pbVal;
}

// Перерахунок при зміні характеристик або вибору
spellStatSelect.addEventListener("change", recalcSpell);
document.querySelectorAll("#spellLevels input").forEach(inp=>inp.addEventListener("input", recalcSpell));

// Генерація спочатку
generateSpellLevels();
recalcSpell();
