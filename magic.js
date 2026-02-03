const levels = [
"Заговір","1 рівень","2 рівень","3 рівень","4 рівень",
"5 рівень","6 рівень","7 рівень","8 рівень","9 рівень"
];

function getSaved(){
  return JSON.parse(localStorage.getItem("owlbear_sheet")||"{}");
}

function getMod(stat){
  let d = getSaved();
  return parseInt(d[stat+"_mod"]) || 0;
}

function getPB(){
  let d = getSaved();
  return parseInt(d["pb"]) || 2;
}

function recalcMagic(){
  let stat = document.getElementById("spellStat").value;
  let mod = getMod(stat);
  let pb = getPB();

  let spellDC = 8 + mod + pb;
  let spellAttack = mod + pb;

  document.getElementById("spellDC").textContent = spellDC;
  document.getElementById("spellAttack").textContent = spellAttack;
}

// ==== Створення рівнів магії ====
function buildLevels(){
  const container = document.getElementById("spellLevels");
  container.innerHTML="";

  let saved = JSON.parse(localStorage.getItem("spell_slots")||"{}");

  levels.forEach((lvl,i)=>{
    let div = document.createElement("div");
    div.className="spell-level";
    div.innerHTML = `<b>${lvl}</b> <div class="dots" id="dots_${i}"></div>`;
    container.appendChild(div);

    let dots = div.querySelector(".dots");
    let count = saved[i] || 0;

    for(let j=0;j<count;j++){
      let dot = document.createElement("div");
      dot.className="dot";
      dot.onclick=()=>dot.classList.toggle("filled");
      dots.appendChild(dot);
    }
  });
}

// ==== Вікно налаштувань слотів ====
function openSettings(){
  let input = prompt(
"Введіть кількість слотів для кожного рівня (через кому, максимум 12):\n"+
"Приклад: 3,2,2,2,1,1,1,0,0,0"
);

if(!input) return;

let arr = input.split(",").map(n=>Math.min(12,parseInt(n)||0));
let saveObj = {};
arr.forEach((v,i)=>saveObj[i]=v);

localStorage.setItem("spell_slots",JSON.stringify(saveObj));
buildLevels();
}

buildLevels();
recalcMagic();

// Оновлюємо при зміні характеристик у вкладці stats
window.addEventListener("storage",recalcMagic);
