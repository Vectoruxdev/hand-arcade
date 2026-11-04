// A ~60-line IndexedDB wrapper, no library. Plan v2, section 4.2. Tests run on fake-indexeddb.

import { DB_NAME, DB_VERSION, migrate } from './schema.ts';
import type { StoreName } from './schema.ts';

let handle: IDBDatabase | null = null;
let opening: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function open(): Promise<IDBDatabase> {
  if (handle) return handle;
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = (e) => migrate(r.result, e.oldVersion);
      r.onsuccess = () => {
        r.result.onversionchange = () => {
          r.result.close();
          handle = null;
          opening = null;
        };
        resolve(r.result);
      };
      r.onerror = () => reject(r.error ?? new Error('IndexedDB open failed'));
      r.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
    try {
      handle = await opening;
    } catch (error) {
      opening = null;
      throw error;
    }
  }
  return opening;
}

export const db = {
  async open(): Promise<void> {
    await open();
  },
  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const d = await open();
    return req(d.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<
      T | undefined
    >;
  },
  async put<T>(store: StoreName, value: T): Promise<void> {
    const d = await open();
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await done(tx);
  },
  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    const d = await open();
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await done(tx);
  },
  async all<T>(store: StoreName): Promise<T[]> {
    const d = await open();
    return req(d.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
  },
  async byIndex<T>(
    store: StoreName,
    index: string,
    query?: IDBValidKey | IDBKeyRange,
  ): Promise<T[]> {
    const d = await open();
    return req(
      d.transaction(store, 'readonly').objectStore(store).index(index).getAll(query),
    ) as Promise<T[]>;
  },
  async tx(
    stores: StoreName[],
    mode: IDBTransactionMode,
    fn: (tx: IDBTransaction) => void,
  ): Promise<void> {
    const d = await open();
    const tx = d.transaction(stores, mode);
    fn(tx);
    await done(tx);
  },
  async clear(store: StoreName): Promise<void> {
    const d = await open();
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    await done(tx);
  },
  /** Close the handle; the next call reopens (tests use this to simulate a reload). */
  close(): void {
    handle?.close();
    handle = null;
    opening = null;
  },
};
