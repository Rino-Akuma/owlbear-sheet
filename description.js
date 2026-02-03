const KEY = "owlbear_description";

function saveDesc(){
  const data = {};
  document.querySelectorAll("#tab_description input, #tab_description textarea")
    .forEach(el=>{
      data[el.id] = el.value;
    });
  localStorage.setItem(KEY, JSON.stringify(data));
}

function loadDesc(){
  const raw = localStorage.getItem(KEY);
  if(!raw) return;

  const data = JSON.parse(raw);

  document.querySelectorAll("#tab_description input, #tab_description textarea")
    .forEach(el=>{
      if(data[el.id] !== undefined) {
        el.value = data[el.id];
      }
    });
}

// === ГОЛОВНЕ ВИПРАВЛЕННЯ ===
// Чекаємо, поки вкладка ТОЧНО з’явиться
function initDescription(){
  const container = document.getElementById("tab_description");
  if(!container || !container.innerHTML.trim()){
    // якщо вкладка ще не підвантажилась — чекаємо 100мс і пробуємо знову
    setTimeout(initDescription, 100);
    return;
  }

  // тепер можна вішати слухачі
  document.querySelectorAll("#tab_description input, #tab_description textarea")
    .forEach(el=>{
      el.addEventListener("input", saveDesc);
    });

  loadDesc();
}

// запускаємо
initDescription();
