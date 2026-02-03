const levels = ["Заговір","1 рівень","2 рівень","3 рівень","4 рівень","5 рівень","6 рівень","7 рівень","8 рівень","9 рівень"];
const spellContainer = document.getElementById("spellContainer");
const spellStat = document.getElementById("spellStat");
const spellSave = document.getElementById("spellSave");
const spellAtk = document.getElementById("spellAtk");

// Налаштування кружечків для рівнів
let spellSettings = {}; // { "1 рівень": 3, "2 рівень": 5, ... }

// Створюємо рамки заклинань
levels.forEach(level=>{
  const box = document.createElement("div");
  box.className = "spell-box";
  const header = document.createElement("div");
  header.className = "spell-header";

  const lvlLabel = document.createElement("div");
  lvlLabel.className = "spell-level";
  lvlLabel.textContent = level;

  const circlesDiv = document.createElement("div");
  circlesDiv.className = "spell-circles";
  circlesDiv.dataset.level = level;

  header.appendChild(lvlLabel);
  header.appendChild(circlesDiv);
  box.appendChild(header);

  // текстове поле для заклинань
  const textarea = document.createElement("textarea");
  textarea.placeholder = "Введіть заклинання...";
  textarea.dataset.level = level;
  box.appendChild(textarea);

  spellContainer.appendChild(box);
});

// Функція створення кружечків для рівня
function createCircles(level){
  const div = document.querySelector(`.spell-circles[data-level='${level}']`);
  div.innerHTML = "";
  const maxCircles = spellSettings[level] || 0;
  for(let i=0;i<maxCircles;i++){
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.dataset.state="0";
    dot.onclick = ()=>{
      dot.dataset.state = dot.dataset.state=="0"?"1":"0";
      dot.classList.toggle("filled", dot.dataset.state=="1");
      saveSpells();
    };
    div.appendChild(dot);
  }
}

// Обчислення спаскидка і атаки заклинань
function recalcSpell(){
  const stat = spellStat.value;
  const modVal = parseInt(document.getElementById(stat+"_mod")?.value)||0;
  const pbVal = parseInt(document.getElementById("pb")?.value)||0;
  const bonusVal = parseInt(document.getElementById("spellBonus")?.value)||0; // додатковий бонус, якщо заданий

  spellSave.value = 8 + modVal + pbVal + bonusVal;
  spellAtk.value = modVal + pbVal;
}

// Збереження заклинань та кружечків
function saveSpells(){
  const data = {};
  document.querySelectorAll(".dot").forEach(dot=>{
    data[`circle_${dot.parentElement.dataset.level}_${[...dot.parentElement.children].indexOf(dot)}`] = dot.dataset.state;
  });
  document.querySelectorAll("textarea").forEach(ta=>{
    data[`text_${ta.dataset.level}`] = ta.value;
  });
  localStorage.setItem("owlbear_spells", JSON.stringify(data));
}

// Завантаження
function loadSpells(){
  const data = JSON.parse(localStorage.getItem("owlbear_spells")||"{}");
  document.querySelectorAll(".dot").forEach(dot=>{
    const key = `circle_${dot.parentElement.dataset.level}_${[...dot.parentElement.children].indexOf(dot)}`;
    if(data[key]=="1") dot.classList.add("filled"), dot.dataset.state="1";
  });
  document.querySelectorAll("textarea").forEach(ta=>{
    const key = `text_${ta.dataset.level}`;
    if(data[key]) ta.value=data[key];
  });
}

// Кнопка налаштувань
document.getElementById("spellSettingsBtn").onclick = ()=>{
  const lvl = prompt("Для якого рівня встановити кількість кружечків? (1–9)", "1 рівень");
  const count = parseInt(prompt("Скільки кружечків? (максимум 12)","3"));
  if(lvl && count>=0 && count<=12){
    spellSettings[lvl] = count;
    createCircles(lvl);
    saveSpells();
  }
};

spellStat.onchange = recalcSpell;

// при завантаженні
loadSpells();
recalcSpell();
