const DB_NAME = 'sosarium';
const STORE_NAME = 'handles';
const FOLDER_KEY = 'uo-folder';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = run(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      })
  );
}

export function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<IDBValidKey | null> {
  return withStore('readwrite', (store) => store.put(handle, FOLDER_KEY));
}

export function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return withStore<FileSystemDirectoryHandle>('readonly', (store) => store.get(FOLDER_KEY));
}

export function clearDirectoryHandle(): Promise<unknown> {
  return withStore('readwrite', (store) => store.delete(FOLDER_KEY));
}
