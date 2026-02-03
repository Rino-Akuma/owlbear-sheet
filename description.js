const KEY = "owlbear_description";

// Збереження всіх полів
function saveDesc(){
  const data = {};
  document.querySelectorAll("input, textarea").forEach(el=>{
    data[el.id] = el.value;
  });
  localStorage.setItem(KEY, JSON.stringify(data));
}

// Завантаження
function loadDesc(){
  const raw = localStorage.getItem(KEY);
  if(!raw) return;

  const data = JSON.parse(raw);
  document.querySelectorAll("input, textarea").forEach(el=>{
    if(data[el.id]) el.value = data[el.id];
  });
}

// Автозбереження при будь-якій зміні
document.querySelectorAll("input, textarea").forEach(el=>{
  el.addEventListener("input", saveDesc);
});

loadDesc();
