const KEY = "owlbear_notes";
const container = document.getElementById("notesContainer");
const addBtn = document.getElementById("addNote");

// Створити одне поле замітки
function createNote(text=""){
  const box = document.createElement("div");
  box.className = "note-box";

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.addEventListener("input", saveNotes);

  box.appendChild(ta);
  container.appendChild(box);
}

// Зберегти всі замітки
function saveNotes(){
  const notes = [];
  container.querySelectorAll("textarea").forEach(ta=>{
    notes.push(ta.value);
  });
  localStorage.setItem(KEY, JSON.stringify(notes));
}

// Завантажити замітки
function loadNotes(){
  const raw = localStorage.getItem(KEY);
  let notes;

  if(raw){
    notes = JSON.parse(raw);
  } else {
    // якщо вперше — створюємо 6 порожніх
    notes = Array(6).fill("");
  }

  container.innerHTML = "";
  notes.forEach(text => createNote(text));
}

// Додати нову замітку
addBtn.addEventListener("click", ()=>{
  createNote("");
  saveNotes();
});

// Ініціалізація
loadNotes();
