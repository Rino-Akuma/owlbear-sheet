// Сховище персонажів: IndexedDB, а якщо воно недоступне — localStorage.
// Запис персонажа: { id, templateId, templateVersion, schemaVersion, updatedAt, data }

const DB_NAME = 'owlbear-sheet';
const STORE = 'characters';
const LS_KEY = 'owlbear-sheet:characters';
export const SCHEMA_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
  return dbPromise;
}

const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
const lsWrite = (arr) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function listCharacters() {
  try {
    const db = await openDb();
    const all = await tx(db, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch {
    return lsRead().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }
}

export async function saveCharacter(c) {
  c.updatedAt = Date.now();
  c.schemaVersion = SCHEMA_VERSION;
  const plain = JSON.parse(JSON.stringify(c));
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.put(plain));
  } catch {
    const arr = lsRead().filter((x) => x.id !== c.id);
    arr.push(plain);
    lsWrite(arr);
  }
}

export async function deleteCharacter(id) {
  try {
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.delete(id));
  } catch {
    lsWrite(lsRead().filter((x) => x.id !== id));
  }
}

export const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `c${Date.now()}${Math.random().toString(16).slice(2)}`);

/** Просимо браузер не чистити дані автоматично. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}

export const BACKUP_FORMAT = 'owlbear-sheet-backup';

export function makeBackup(characters) {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), characters };
}

/** Перевіряє файл імпорту. Повертає масив персонажів або кидає помилку. */
export function readBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('bad'); }
  if (!obj || obj.format !== BACKUP_FORMAT || !Array.isArray(obj.characters)) throw new Error('bad');
  for (const c of obj.characters) {
    if (!c || typeof c.id !== 'string' || typeof c.templateId !== 'string' || typeof c.data !== 'object') throw new Error('bad');
  }
  return obj.characters;
}
