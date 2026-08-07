// Minimaler IndexedDB-Wrapper. Alle Daten bleiben ausschließlich lokal im Browser.
const DB_NAME = 'finanzen-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('transactions')) {
        const store = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date');
        store.createIndex('category', 'category');
        store.createIndex('hash', 'hash', { unique: false });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('rules')) {
        db.createObjectStore('rules', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrapRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const DB = {
  async add(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return wrapRequest(store.add(value));
  },
  async put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return wrapRequest(store.put(value));
  },
  async get(storeName, id) {
    const store = await tx(storeName, 'readonly');
    return wrapRequest(store.get(id));
  },
  async getAll(storeName) {
    const store = await tx(storeName, 'readonly');
    return wrapRequest(store.getAll());
  },
  async delete(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    return wrapRequest(store.delete(id));
  },
  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return wrapRequest(store.clear());
  },
  async bulkAdd(storeName, values) {
    const store = await tx(storeName, 'readwrite');
    return Promise.all(values.map((v) => wrapRequest(store.add(v))));
  },
  async count(storeName) {
    const store = await tx(storeName, 'readonly');
    return wrapRequest(store.count());
  },
};
