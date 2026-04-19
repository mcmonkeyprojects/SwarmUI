import type { StateStorage } from 'zustand/middleware';

const DATABASE_NAME = 'swarmui-react';
const STORE_NAME = 'zustand-persist';
const DATABASE_VERSION = 1;

type StoredRecord = {
  key: string;
  value: string;
};

let openDatabasePromise: Promise<IDBDatabase> | null = null;

function getLocalStorageFallback(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof window === 'undefined') {
        return null;
      }
      return window.localStorage.getItem(name);
    },
    setItem: (name, value) => {
      if (typeof window === 'undefined') {
        return;
      }
      window.localStorage.setItem(name, value);
    },
    removeItem: (name) => {
      if (typeof window === 'undefined') {
        return;
      }
      window.localStorage.removeItem(name);
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (openDatabasePromise) {
    return openDatabasePromise;
  }

  openDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  }).catch((error) => {
    openDatabasePromise = null;
    throw error;
  });

  return openDatabasePromise!;
}

function withStore<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    const store = transaction.objectStore(STORE_NAME);
    handler(store, resolve, reject);
  }));
}

export function createIndexedDbStorage(namespace: string): StateStorage {
  const fallback = getLocalStorageFallback();

  const resolveKey = (name: string): string => `${namespace}:${name}`;
  const readFallback = (legacyKey: string, namespacedKey: string): string | null => {
    const legacyValue = fallback.getItem(legacyKey) as string | null;
    if (legacyValue !== null) {
      return legacyValue;
    }
    return fallback.getItem(namespacedKey) as string | null;
  };

  const getItem = async (name: string): Promise<string | null> => {
    const key = resolveKey(name);
    try {
      const value = await withStore<string | null>('readonly', (store, resolve, reject) => {
        const request = store.get(key);
        request.onerror = () => reject(request.error ?? new Error('Failed to read from IndexedDB.'));
        request.onsuccess = () => {
          const result = request.result as StoredRecord | undefined;
          resolve(result?.value ?? null);
        };
      });
      if (value !== null) {
        return value;
      }
      const fallbackValue = readFallback(name, key);
      if (fallbackValue !== null) {
        void setItem(name, fallbackValue);
      }
      return fallbackValue;
    } catch {
      return readFallback(name, key);
    }
  };

  const setItem = async (name: string, value: string): Promise<void> => {
    const key = resolveKey(name);
    try {
      await withStore<void>('readwrite', (store, resolve, reject) => {
        const request = store.put({ key, value } satisfies StoredRecord);
        request.onerror = () => reject(request.error ?? new Error('Failed to write to IndexedDB.'));
        request.onsuccess = () => resolve();
      });
      fallback.removeItem(name);
      fallback.removeItem(key);
    } catch {
      fallback.setItem(name, value);
    }
  };

  const removeItem = async (name: string): Promise<void> => {
    const key = resolveKey(name);
    try {
      await withStore<void>('readwrite', (store, resolve, reject) => {
        const request = store.delete(key);
        request.onerror = () => reject(request.error ?? new Error('Failed to delete from IndexedDB.'));
        request.onsuccess = () => resolve();
      });
      fallback.removeItem(name);
      fallback.removeItem(key);
    } catch {
      fallback.removeItem(name);
      fallback.removeItem(key);
    }
  };

  return {
    getItem,
    setItem,
    removeItem,
  };
}
