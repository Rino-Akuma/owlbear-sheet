// ==== Налаштування макс 12 кружечків ====
const maxCircles = 12;

// ==== Завантажуємо стан з localStorage ====
function loadMagic(){
  let data = JSON.parse(localStorage.getItem("owlbear_magic")||"{}");

  document.querySelectorAll(".level-box").forEach(box=>{
    let level = box.dataset.level;
    let circlesDiv = box.querySelector(".circles");
    circlesDiv.innerHTML = ""; // очищуємо
    let count = data[level+"_circles"] || 0;
    for(let i=0;i<count;i++){
      let c = document.createElement("div");
      c.classList.add("circle");
      if(data[level+"_circleStates"] && data[level+"_circleStates"][i]) c.classList.add("filled");
      c.addEventListener("click", ()=>{c.classList.toggle("filled"); saveMagic();});
      circlesDiv.appendChild(c);
    }

    // додаємо текст заклинань
    if(data[level+"_text"] && box.querySelector("textarea")){
      box.querySelector("textarea").value = data[level+"_text"];
    }

    // додатково для налаштувань: додаємо пусті кружечки до 12
    let extra = maxCircles - circlesDiv.children.length;
    for(let i=0;i<extra;i++){
      let c = document.createElement("div");
      c.classList.add("circle");
      c.addEventListener("click", ()=>{c.classList.toggle("filled"); saveMagic();});
      circlesDiv.appendChild(c);
    }
  });

  // відновлюємо характеристику
  if(data["spellStat"]){
    let sel = document.getElementById("spellStat");
    sel.value = data["spellStat"];
  }

  updateSpellValues();
}

// ==== Зберігання ====
function saveMagic(){
  let data = {};
  document.querySelectorAll(".level-box").forEach(box=>{
    let level = box.dataset.level;
    let circles = Array.from(box.querySelectorAll(".circle")).map(c=>c.classList.contains("filled")?1:0);
    data[level+"_circleStates"] = circles;
    data[level+"_circles"] = circles.length;
    data[level+"_text"] = box.querySelector("textarea") ? box.querySelector("textarea").value : "";
  });
  data["spellStat"] = document.getElementById("spellStat").value;
  localStorage.setItem("owlbear_magic", JSON.stringify(data));
}

// ==== Обчислення атаки і спаскідка ====
function updateSpellValues(){
  const stat = document.getElementById("spellStat").value;
  let modifier = 0;
  let pb = 0;
  // Підтягуємо з stats.html / stats.js
  if(window.parent){
    const doc = window.parent.document;
    if(doc.getElementById(stat+"_mod")) modifier = parseInt(doc.getElementById(stat+"_mod").value)||0;
    if(doc.getElementById("pb")) pb = parseInt(doc.getElementById("pb").value)||0;
  }
  document.getElementById("spellSave").value = 8 + modifier + pb;
  document.getElementById("spellAttack").value = modifier + pb;
}

// ==== Події ====
document.getElementById("spellStat").addEventListener("change", ()=>{
  updateSpellValues();
  saveMagic();
});

// textarea зберігаємо при зміні
document.querySelectorAll("textarea").forEach(t=>{
  t.addEventListener("input", saveMagic);
});

// Завантаження при старті
loadMagic();
