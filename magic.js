// посилання на характеристики з stats.html
function getStatMod(stat){
  const el = parent.document.getElementById(stat+"_val"); // підтягує з stats.html
  if(!el) return 0;
  let val = parseInt(el.value)||10;
  return Math.floor((val-10)/2);
}
function getPB(){
  const el = parent.document.getElementById("pb");
  if(!el) return 0;
  return parseInt(el.value)||0;
}

const spellStat = document.getElementById("spellStat");
const spellSave = document.getElementById("spellSave");
const spellAttack = document.getElementById("spellAttack");

function recalcSpell(){
  const mod = getStatMod(spellStat.value);
  const pb = getPB();
  spellSave.textContent = 8 + mod + pb;
  spellAttack.textContent = mod + pb;
}
spellStat.addEventListener("change", recalcSpell);
recalcSpell();

// ===== Кружечки для слотів =====
const maxCircles = 12;
const spellLevels = document.querySelectorAll(".level-box[data-level!='Cantrip']");
spellLevels.forEach(levelBox=>{
  const lvl = levelBox.dataset.level;
  const container = levelBox.querySelector(".circles");
  for(let i=0;i<maxCircles;i++){
    const c = document.createElement("div");
    c.className="circle";
    c.dataset.level=lvl;
    container.appendChild(c);
    c.addEventListener("click", ()=>{
      c.classList.toggle("filled");
      saveCircles();
    });
  }
});

// ===== Збереження тексту та кружечків =====
function saveCircles(){
  const data = {};
  spellLevels.forEach(levelBox=>{
    const lvl = levelBox.dataset.level;
    const circles = Array.from(levelBox.querySelectorAll(".circle")).map(c=>c.classList.contains("filled") ? "1":"0");
    data["circles_"+lvl] = circles.join("");
  });
  // текст заклинань
  document.querySelectorAll(".spell-textarea").forEach(txt=>{
    data["spell_"+txt.dataset.level] = txt.value;
  });
  localStorage.setItem("magic_sheet", JSON.stringify(data));
}

function loadCircles(){
  const data = JSON.parse(localStorage.getItem("magic_sheet")||"{}");
  spellLevels.forEach(levelBox=>{
    const lvl = levelBox.dataset.level;
    const circlesData = data["circles_"+lvl] || "";
    const circles = levelBox.querySelectorAll(".circle");
    circles.forEach((c,i)=>{
      if(circlesData[i]=="1") c.classList.add("filled");
      else c.classList.remove("filled");
    });
  });
  document.querySelectorAll(".spell-textarea").forEach(txt=>{
    txt.value = data["spell_"+txt.dataset.level] || "";
  });
}
document.querySelectorAll(".spell-textarea").forEach(txt=>txt.addEventListener("input", saveCircles));

loadCircles();
