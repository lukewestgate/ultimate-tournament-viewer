/** Minimal promise wrapper over IndexedDB: one key-value object store for cached workbooks. */

const DB_NAME = 'tournament-viewer';
const STORE = 'kv';
let dbp: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key)).then(() => undefined);
export const idbDel = (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined);
export const idbKeys = () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys());

/** Rough size of what's stored, for App settings. */
export async function idbUsage(): Promise<{ key: string; bytes: number }[]> {
  const keys = await idbKeys();
  const out: { key: string; bytes: number }[] = [];
  for (const k of keys) {
    const v = await idbGet(String(k));
    out.push({ key: String(k), bytes: JSON.stringify(v ?? '').length });
  }
  return out;
}
