/* Persistencia local para el Hito 2. No depende de librerías externas. */
class OfflineStore {
  constructor() { this.dbPromise = null; }

  open() {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('la-hacienda-offline-v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('meta');
        const operations = db.createObjectStore('operations', { keyPath: 'id' });
        operations.createIndex('status', 'status');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  async value(store, key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(store, value === undefined ? 'readonly' : 'readwrite');
      const request = value === undefined ? transaction.objectStore(store).get(key) : transaction.objectStore(store).put(value, key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getMeta(key) { return this.value('meta', key); }
  setMeta(key, value) { return this.value('meta', key, value); }

  async saveSnapshot(snapshot) {
    await this.setMeta('snapshot', { ...snapshot, syncedAt: new Date().toISOString() });
  }
  snapshot() { return this.getMeta('snapshot'); }

  async enqueue(type, payload, actor) {
    const db = await this.open();
    const operation = {
      id: crypto.randomUUID(), type, payload, actor,
      occurredAt: new Date().toISOString(), status: 'pending', error: null,
    };
    return new Promise((resolve, reject) => {
      const request = db.transaction('operations', 'readwrite').objectStore('operations').add(operation);
      request.onsuccess = () => resolve(operation);
      request.onerror = () => reject(request.error);
    });
  }

  async pending() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('operations').objectStore('operations').getAll();
      // Un error del servidor no elimina la operación ni la vuelve invisible.
      // Así puede reintentarse cuando cambien las condiciones que la bloquearon.
      request.onsuccess = () => resolve(request.result.filter((item) => item.status !== 'applied'));
      request.onerror = () => reject(request.error);
    });
  }

  async pendingForUser(userId) {
    return (await this.pending()).filter((operation) => Number(operation.actor?.userId) === Number(userId));
  }

  async mark(id, status, error = null) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const store = db.transaction('operations', 'readwrite').objectStore('operations');
      const get = store.get(id);
      get.onsuccess = () => {
        if (!get.result) return resolve();
        store.put({ ...get.result, status, error });
        resolve();
      };
      get.onerror = () => reject(get.error);
    });
  }

  async countPending() { return (await this.pending()).length; }
}

window.OfflineStore = OfflineStore;
