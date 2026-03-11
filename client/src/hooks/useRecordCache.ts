/**
 * useRecordCache — IndexedDB-backed cache for dog records and record dates.
 * Stores the last 100 records per team and the list of dates that have records,
 * so the Records tab and Lookup dropdown load instantly even offline.
 */

const DB_NAME = "abc-buddy-cache";
const DB_VERSION = 2; // bumped to add dates store
const RECORDS_STORE = "records";
const DATES_STORE = "recordDates";
const MAX_CACHED = 100;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        db.createObjectStore(RECORDS_STORE, { keyPath: "_cacheKey" });
      }
      if (!db.objectStoreNames.contains(DATES_STORE)) {
        // key: teamId, value: { teamId, dates: string[], cachedAt: number }
        db.createObjectStore(DATES_STORE, { keyPath: "teamId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Records ──────────────────────────────────────────────────────────────────

export async function getCachedRecords(teamId: string): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RECORDS_STORE, "readonly");
      const store = tx.objectStore(RECORDS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const all: any[] = req.result ?? [];
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
    const tx = db.transaction(RECORDS_STORE, "readwrite");
    const store = tx.objectStore(RECORDS_STORE);

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
    console.warn("IndexedDB records write failed:", e);
  }
}

// ── Record Dates ──────────────────────────────────────────────────────────────

export async function getCachedRecordDates(teamId: string): Promise<string[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DATES_STORE, "readonly");
      const store = tx.objectStore(DATES_STORE);
      const req = store.get(teamId);
      req.onsuccess = () => {
        const entry = req.result;
        resolve(entry?.dates ?? []);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function setCachedRecordDates(teamId: string, dates: string[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(DATES_STORE, "readwrite");
    const store = tx.objectStore(DATES_STORE);
    store.put({ teamId, dates, cachedAt: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB dates write failed:", e);
  }
}
