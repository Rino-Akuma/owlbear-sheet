// Ключ для збереження в localStorage (окремо від інших вкладок)
const KEY = "owlbear_equipment";

// ЗБЕРЕЖЕННЯ
function saveEquipment(){
  const data = {
    cp: document.getElementById("coin_cp").value,
    sp: document.getElementById("coin_sp").value,
    gp: document.getElementById("coin_gp").value,
    pp: document.getElementById("coin_pp").value,
    ep: document.getElementById("coin_ep").value,
    text: document.getElementById("inventoryText").value
  };

  localStorage.setItem(KEY, JSON.stringify(data));
}

// ЗАВАНТАЖЕННЯ
function loadEquipment(){
  const raw = localStorage.getItem(KEY);
  if(!raw) return;

  const data = JSON.parse(raw);

  if(data.cp) document.getElementById("coin_cp").value = data.cp;
  if(data.sp) document.getElementById("coin_sp").value = data.sp;
  if(data.gp) document.getElementById("coin_gp").value = data.gp;
  if(data.pp) document.getElementById("coin_pp").value = data.pp;
  if(data.ep) document.getElementById("coin_ep").value = data.ep;
  if(data.text) document.getElementById("inventoryText").value = data.text;
}

// Додаємо автозбереження на будь-яку зміну
document.querySelectorAll("input, textarea").forEach(el=>{
  el.addEventListener("input", saveEquipment);
});

// Завантажуємо при відкритті вкладки
loadEquipment();
