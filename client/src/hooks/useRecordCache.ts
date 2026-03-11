/**
 * useRecordCache — IndexedDB-backed cache for dog records.
 * Stores the last 100 records per team so the Records tab loads
 * instantly even on a slow connection or offline.
 */

const DB_NAME = "abc-buddy-cache";
const DB_VERSION = 1;
const STORE_NAME = "records";
const MAX_CACHED = 100;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // key: `${teamId}:${id}`
        db.createObjectStore(STORE_NAME, { keyPath: "_cacheKey" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedRecords(teamId: string): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all: any[] = req.result ?? [];
        // Filter by team and strip the internal cache key
        const teamRecords = all
          .filter((r) => r._teamId === teamId)
          .map(({ _cacheKey, _teamId, ...rest }) => rest);
        resolve(teamRecords);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function setCachedRecords(teamId: string, records: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Delete all existing records for this team first
    const allReq = store.getAll();
    await new Promise<void>((resolve, reject) => {
      allReq.onsuccess = () => {
        const existing: any[] = allReq.result ?? [];
        existing
          .filter((r) => r._teamId === teamId)
          .forEach((r) => store.delete(r._cacheKey));
        resolve();
      };
      allReq.onerror = () => reject(allReq.error);
    });

    // Write the latest records (capped at MAX_CACHED)
    const toCache = records.slice(0, MAX_CACHED);
    toCache.forEach((record) => {
      store.put({
        ...record,
        _cacheKey: `${teamId}:${record.id}`,
        _teamId: teamId,
      });
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB write failed:", e);
  }
}
