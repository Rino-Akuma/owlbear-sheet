const weaponList = document.getElementById("weaponList");
const abilitiesText = document.getElementById("abilitiesText");

function openModal(){
  document.getElementById("weaponModal").style.display="block";
}

function closeModal(){
  document.getElementById("weaponModal").style.display="none";
}

// отримуємо дані з вкладки характеристик
function getStatMod(stat){
  const data = JSON.parse(localStorage.getItem("owlbear_sheet")||"{}");
  return parseInt(data[stat+"_mod"]||0);
}

function getPB(){
  const data = JSON.parse(localStorage.getItem("owlbear_sheet")||"{}");
  return parseInt(data["pb"]||2);
}

// збереження здібностей
abilitiesText.addEventListener("input",()=>{
  localStorage.setItem("abilitiesText", abilitiesText.value);
});

// >>> НОВЕ: АВТОРОЗШИРЕННЯ TEXTAREA <<<
function autoResize(el){
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// запускаємо при кожному вводі
abilitiesText.addEventListener("input", function(){
  autoResize(this);
});
// >>> КІНЕЦЬ НОВОГО БЛОКУ <<<

function loadAbilities(){
  abilitiesText.value = localStorage.getItem("abilitiesText") || "";
  autoResize(abilitiesText); // >>> НОВЕ: підганяємо висоту після завантаження
}

// ===== ЗБРОЯ =====
function saveWeapon(){
  const name = w_name.value;
  const stat = w_stat.value;
  const proficient = w_proficient.checked;
  const extra = parseInt(w_extra.value)||0;
  const dice = w_dice.value || "1d6";
  const dmgType = w_damageType.value || "—";
  const notes = w_notes.value;

  const mod = getStatMod(stat);
  const totalBonus = mod + (proficient ? getPB() : 0) + extra;

  const weapon = {name, stat, mod, proficient, extra, dice, dmgType, notes};

  let weapons = JSON.parse(localStorage.getItem("weapons")||"[]");
  weapons.push(weapon);
  localStorage.setItem("weapons", JSON.stringify(weapons));

  renderWeapons();
  closeModal();
}

function deleteWeapon(index){
  let weapons = JSON.parse(localStorage.getItem("weapons")||"[]");
  weapons.splice(index,1);
  localStorage.setItem("weapons", JSON.stringify(weapons));
  renderWeapons();
}

function renderWeapons(){
  let weapons = JSON.parse(localStorage.getItem("weapons")||"[]");
  weaponList.innerHTML="";

  weapons.forEach((w,i)=>{
    const mod = getStatMod(w.stat);
    const bonus = mod + (w.proficient ? getPB() : 0) + (w.extra||0);

    const div = document.createElement("div");
    div.className="weapon-item";

    div.innerHTML = `
      <div>${w.name}</div>
      <div>+${bonus}</div>
      <div>${w.dice}</div>
      <div>${w.dmgType}</div>
      <div class="weapon-actions">
        <button class="note-btn">📝</button>
        <button onclick="deleteWeapon(${i})">🗑</button>
      </div>
    `;

    div.querySelector(".note-btn").addEventListener("click", ()=>{
      alert(w.notes || "Нет описания");
    });

    weaponList.appendChild(div);
  });
}

loadAbilities();
renderWeapons();
