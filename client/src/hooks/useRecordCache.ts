/**
 * useRecordCache — IndexedDB-backed cache for dog records and record dates.
 * Stores the last 100 records per team and the list of dates that have records,
 * so the Records tab and Lookup dropdown load instantly even offline.
 */

const DB_NAME = "abc-buddy-cache";
const DB_VERSION = 6; // v6: added tagDateDogs store for per-date dog caching
const RECORDS_STORE = "records";
const DATES_STORE = "recordDates";
const PLANS_STORE = "releasePlans";
const PLAN_DOGS_STORE = "planDogs";
const TAG_DATE_DOGS_STORE = "tagDateDogs";
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
        db.createObjectStore(DATES_STORE, { keyPath: "teamId" });
      }
      if (!db.objectStoreNames.contains(PLANS_STORE)) {
        // key: teamId, value: { teamId, plans: ReleasePlan[], cachedAt: number }
        db.createObjectStore(PLANS_STORE, { keyPath: "teamId" });
      }
      if (!db.objectStoreNames.contains(PLAN_DOGS_STORE)) {
        // key: planId (number), value: { planId, dogs: any[], cachedAt: number }
        db.createObjectStore(PLAN_DOGS_STORE, { keyPath: "planId" });
      }
      if (!db.objectStoreNames.contains(TAG_DATE_DOGS_STORE)) {
        // key: "teamId:YYYY-MM-DD", value: { key, teamId, date, dogs: any[], cachedAt: number }
        db.createObjectStore(TAG_DATE_DOGS_STORE, { keyPath: "key" });
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

// ── Release Plans ─────────────────────────────────────────────────────────────

export async function getCachedReleasePlans(teamId: string): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLANS_STORE, "readonly");
      const store = tx.objectStore(PLANS_STORE);
      const req = store.get(teamId);
      req.onsuccess = () => resolve(req.result?.plans ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Returns plans + the cachedAt timestamp (ms since epoch, or null if not cached) */
export async function getCachedReleasePlansWithMeta(teamId: string): Promise<{ plans: any[]; cachedAt: number | null }> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLANS_STORE, "readonly");
      const store = tx.objectStore(PLANS_STORE);
      const req = store.get(teamId);
      req.onsuccess = () => resolve({ plans: req.result?.plans ?? [], cachedAt: req.result?.cachedAt ?? null });
      req.onerror = () => reject(req.error);
    });
  } catch {
    return { plans: [], cachedAt: null };
  }
}

export async function setCachedReleasePlans(teamId: string, plans: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(PLANS_STORE, "readwrite");
    const store = tx.objectStore(PLANS_STORE);
    store.put({ teamId, plans, cachedAt: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB release plans write failed:", e);
  }
}

// ── Plan Dogs ────────────────────────────────────────────────────────────────────────

export async function getCachedPlanDogs(planId: number): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLAN_DOGS_STORE, "readonly");
      const store = tx.objectStore(PLAN_DOGS_STORE);
      const req = store.get(planId);
      req.onsuccess = () => resolve(req.result?.dogs ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function setCachedPlanDogs(planId: number, dogs: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(PLAN_DOGS_STORE, "readwrite");
    const store = tx.objectStore(PLAN_DOGS_STORE);
    store.put({ planId, dogs, cachedAt: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB plan dogs write failed:", e);
  }
}

// ── Tag Date Dogs ─────────────────────────────────────────────────────────────

/** Get cached dogs for a specific catching date (YYYY-MM-DD) for a team */
export async function getCachedTagDateDogs(teamId: string, date: string): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TAG_DATE_DOGS_STORE, "readonly");
      const store = tx.objectStore(TAG_DATE_DOGS_STORE);
      const req = store.get(`${teamId}:${date}`);
      req.onsuccess = () => resolve(req.result?.dogs ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Cache all dogs for a specific catching date. Called after a successful online fetch. */
export async function setCachedTagDateDogs(teamId: string, date: string, dogs: any[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(TAG_DATE_DOGS_STORE, "readwrite");
    const store = tx.objectStore(TAG_DATE_DOGS_STORE);
    store.put({ key: `${teamId}:${date}`, teamId, date, dogs, cachedAt: Date.now() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB tag date dogs write failed:", e);
  }
}

/**
 * Evict cached plan dog entries for plan IDs no longer in the active plan list.
 * Called after a successful online fetch of getPlans.
 */
export async function evictStalePlanDogs(activePlanIds: number[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(PLAN_DOGS_STORE, "readwrite");
    const store = tx.objectStore(PLAN_DOGS_STORE);
    const allReq = store.getAll();
    await new Promise<void>((resolve, reject) => {
      allReq.onsuccess = () => {
        const all: any[] = allReq.result ?? [];
        const activeSet = new Set(activePlanIds);
        all
          .filter((entry) => !activeSet.has(entry.planId))
          .forEach((entry) => store.delete(entry.planId));
        resolve();
      };
      allReq.onerror = () => reject(allReq.error);
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB plan dogs eviction failed:", e);
  }
}

/**
 * Evict cached date entries that are no longer in the active date list.
 * Called after a successful online fetch of getRecordDates.
 */
export async function evictStaleTagDateDogs(teamId: string, activeDates: string[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(TAG_DATE_DOGS_STORE, "readwrite");
    const store = tx.objectStore(TAG_DATE_DOGS_STORE);
    const allReq = store.getAll();
    await new Promise<void>((resolve, reject) => {
      allReq.onsuccess = () => {
        const all: any[] = allReq.result ?? [];
        const activeSet = new Set(activeDates.map((d) => `${teamId}:${d}`));
        all
          .filter((entry) => entry.teamId === teamId && !activeSet.has(entry.key))
          .forEach((entry) => store.delete(entry.key));
        resolve();
      };
      allReq.onerror = () => reject(allReq.error);
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB tag date eviction failed:", e);
  }
}
