const NOTES_KEY = "owlbear_notes";
const notesContainer = document.getElementById("notesContainer");
const addBtn = document.getElementById("addNote");

// Завантажуємо заметки з localStorage
let notesData = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]");

// Якщо немає заметок — додаємо 6 початкових
if(notesData.length === 0){
  notesData = Array(6).fill("");
  localStorage.setItem(NOTES_KEY, JSON.stringify(notesData));
}

// Функція створення одного текстового поля
function createNote(text="", index){
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "flex-start";
  wrapper.style.gap = "6px";

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.flexGrow = "1";
  ta.style.resize = "vertical";
  ta.style.background = "rgba(255,255,255,0.15)";
  ta.style.border = "1px solid #555";
  ta.style.borderRadius = "4px";
  ta.style.color = "white";
  ta.style.padding = "4px";
  ta.dataset.index = index;
  ta.addEventListener("input", saveNotes);

  const delBtn = document.createElement("button");
  delBtn.textContent = "✖";
  delBtn.style.background="#2b2d31";
  delBtn.style.color="white";
  delBtn.style.border="1px solid #555";
  delBtn.style.borderRadius="4px";
  delBtn.style.cursor="pointer";
  delBtn.style.padding="0 6px";
  delBtn.addEventListener("click", ()=>{
    notesData.splice(index,1);
    renderNotes();
    saveNotes();
  });

  wrapper.appendChild(ta);
  wrapper.appendChild(delBtn);
  return wrapper;
}

// Збереження всіх заметок
function saveNotes(){
  const textareas = notesContainer.querySelectorAll("textarea");
  notesData = Array.from(textareas).map(ta => ta.value);
  localStorage.setItem(NOTES_KEY, JSON.stringify(notesData));
}

// Відмалювання всех заметок
function renderNotes(){
  notesContainer.innerHTML = "";
  notesData.forEach((text,i)=>{
    notesContainer.appendChild(createNote(text,i));
  });
}

// Додавання нової заметки
addBtn.addEventListener("click", ()=>{
  notesData.push("");
  renderNotes();
  saveNotes();
});

// Ініціалізація
renderNotes();
