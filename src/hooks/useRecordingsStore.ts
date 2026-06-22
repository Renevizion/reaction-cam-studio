// IndexedDB-backed recording persistence so recordings survive refresh.
import { Recording } from './useRecorder';

const DB_NAME = 'scriptcam';
const STORE = 'recordings';
const VERSION = 1;

interface StoredRecording {
  id: string;
  blob: Blob;
  duration: number;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(rec: Recording): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      id: rec.id,
      blob: rec.blob,
      duration: rec.duration,
      createdAt: rec.createdAt.getTime(),
    } as StoredRecording);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (err) {
    console.warn('Failed to persist recording', err);
  }
}

export async function loadRecordings(): Promise<Recording[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    return await new Promise<Recording[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as StoredRecording[]) || [];
        const recs = items
          .sort((a, b) => b.createdAt - a.createdAt)
          .map<Recording>((s) => ({
            id: s.id,
            blob: s.blob,
            url: URL.createObjectURL(s.blob),
            duration: s.duration,
            createdAt: new Date(s.createdAt),
          }));
        resolve(recs);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removeRecording(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
  } catch {}
}
