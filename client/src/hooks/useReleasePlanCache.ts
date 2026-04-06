/**
 * useReleasePlanCache
 *
 * Caches release plans and their dog records in IndexedDB so the Release tab
 * works fully offline. Strategy:
 *   - Online: fetch from server → write to IDB → stamp lastSynced
 *   - Offline: read from IDB → surface lastSynced timestamp to UI
 *   - Reconnect: auto-refresh from server
 */

import { useEffect, useRef, useState, useCallback } from "react";

const DB_NAME = "abc-buddy-release-cache";
const DB_VERSION = 1;
const STORE_PLANS = "plans";
const STORE_DOGS = "planDogs";
const STORE_META = "meta";

// ── Types ──────────────────────────────────────────────────────────────────

export type CachedPlan = {
  id: number;
  teamIdentifier: string;
  planDate: string;
  orderIndex: number;
  notes: string | null;
  createdAt: string;
  archivedAt: string | null;
  firstReleasedAt: string | null;
  lastReleasedAt: string | null;
  totalDogs: number;
  releasedDogs: number;
};

export type CachedPlanDog = {
  planDogId: number;
  planId: number;
  dogId: string;
  teamIdentifier: string;
  imageUrl: string | null;
  photo2Url: string | null;
  description: string | null;
  areaName: string | null;
  latitude: number | null;
  longitude: number | null;
  recordedAt: string | null;
  releasedAt: string | null;
  releasePhotoUrl: string | null;
  releaseLatitude: number | null;
  releaseLongitude: number | null;
  releaseAreaName: string | null;
  releaseDistanceMetres: number | null;
  notes: string | null;
  gender: string | null;
  addedByStaffId: string | null;
  addedByStaffName: string | null;
  planAddedByStaffId: string | null;
  planAddedByStaffName: string | null;
  sortOrder: number;
  addedAt: string | null;
};

// ── IDB helpers ────────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PLANS)) {
        const ps = db.createObjectStore(STORE_PLANS, { keyPath: "id" });
        ps.createIndex("byTeam", "teamIdentifier", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DOGS)) {
        const ds = db.createObjectStore(STORE_DOGS, { keyPath: "planDogId" });
        ds.createIndex("byPlan", "planId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetByIndex<T>(db: IDBDatabase, store: string, index: string, value: IDBValidKey): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutAll(db: IDBDatabase, store: string, items: object[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const item of items) s.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteByIndex(db: IDBDatabase, store: string, index: string, value: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    const req = s.index(index).openCursor(IDBKeyRange.only(value));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetMeta(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readonly");
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSetMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────

interface UseReleasePlanCacheOptions {
  teamIdentifier: string;
  /** Called to fetch fresh plans from the server */
  fetchPlans: () => Promise<CachedPlan[]>;
  /** Called to fetch dogs for a specific plan from the server */
  fetchPlanDogs: (planId: number) => Promise<CachedPlanDog[]>;
  /** IDs of plans currently visible (to know which dogs to cache) */
  visiblePlanIds: number[];
}

interface CacheState {
  plans: CachedPlan[];
  planDogs: Record<number, CachedPlanDog[]>;
  lastSynced: Date | null;
  isFromCache: boolean;
  isSyncing: boolean;
}

export function useReleasePlanCache({
  teamIdentifier,
  fetchPlans,
  fetchPlanDogs,
  visiblePlanIds,
}: UseReleasePlanCacheOptions) {
  const [state, setState] = useState<CacheState>({
    plans: [],
    planDogs: {},
    lastSynced: null,
    isFromCache: false,
    isSyncing: false,
  });

  const dbRef = useRef<IDBDatabase | null>(null);
  const metaKey = `lastSynced:${teamIdentifier}`;

  const getDb = useCallback(async () => {
    if (!dbRef.current) dbRef.current = await openDb();
    return dbRef.current;
  }, []);

  /** Load from IDB cache (used when offline) */
  const loadFromCache = useCallback(async () => {
    try {
      const db = await getDb();
      const plans = await idbGetByIndex<CachedPlan>(db, STORE_PLANS, "byTeam", teamIdentifier);
      const lastSyncedRaw = await idbGetMeta(db, metaKey);
      const lastSynced = lastSyncedRaw ? new Date(lastSyncedRaw as string) : null;

      // Load dogs for all cached plans
      const planDogs: Record<number, CachedPlanDog[]> = {};
      for (const plan of plans) {
        planDogs[plan.id] = await idbGetByIndex<CachedPlanDog>(db, STORE_DOGS, "byPlan", plan.id);
      }

      setState((prev) => ({
        ...prev,
        plans,
        planDogs,
        lastSynced,
        isFromCache: true,
        isSyncing: false,
      }));
    } catch (e) {
      console.warn("[ReleasePlanCache] Failed to load from cache:", e);
    }
  }, [getDb, teamIdentifier, metaKey]);

  /** Fetch from server and write to IDB */
  const syncFromServer = useCallback(async () => {
    if (!teamIdentifier) return;
    setState((prev) => ({ ...prev, isSyncing: true }));
    try {
      const plans = await fetchPlans();
      const db = await getDb();

      // Write plans — delete old ones for this team first
      await idbDeleteByIndex(db, STORE_PLANS, "byTeam", teamIdentifier);
      if (plans.length > 0) await idbPutAll(db, STORE_PLANS, plans);

      // Fetch dogs for all plans in parallel and cache them
      const planDogs: Record<number, CachedPlanDog[]> = {};
      await Promise.all(
        plans.map(async (plan) => {
          try {
            const dogs = await fetchPlanDogs(plan.id);
            planDogs[plan.id] = dogs;
            // Delete old dogs for this plan then write fresh
            await idbDeleteByIndex(db, STORE_DOGS, "byPlan", plan.id);
            if (dogs.length > 0) await idbPutAll(db, STORE_DOGS, dogs);
          } catch (e) {
            console.warn(`[ReleasePlanCache] Failed to fetch dogs for plan ${plan.id}:`, e);
            // Fall back to cached dogs
            planDogs[plan.id] = await idbGetByIndex<CachedPlanDog>(db, STORE_DOGS, "byPlan", plan.id);
          }
        })
      );

      const now = new Date();
      await idbSetMeta(db, metaKey, now.toISOString());

      setState({
        plans,
        planDogs,
        lastSynced: now,
        isFromCache: false,
        isSyncing: false,
      });
    } catch (e) {
      console.warn("[ReleasePlanCache] Server sync failed, falling back to cache:", e);
      await loadFromCache();
    }
  }, [teamIdentifier, fetchPlans, fetchPlanDogs, getDb, metaKey, loadFromCache]);

  /** Fetch dogs for a specific plan (lazy — called when plan is selected) */
  const ensurePlanDogs = useCallback(async (planId: number) => {
    if (state.planDogs[planId]) return; // already loaded
    if (!navigator.onLine) {
      // Load from cache
      try {
        const db = await getDb();
        const dogs = await idbGetByIndex<CachedPlanDog>(db, STORE_DOGS, "byPlan", planId);
        setState((prev) => ({
          ...prev,
          planDogs: { ...prev.planDogs, [planId]: dogs },
        }));
      } catch (e) {
        console.warn(`[ReleasePlanCache] Failed to load dogs for plan ${planId} from cache:`, e);
      }
    } else {
      try {
        const dogs = await fetchPlanDogs(planId);
        const db = await getDb();
        await idbDeleteByIndex(db, STORE_DOGS, "byPlan", planId);
        if (dogs.length > 0) await idbPutAll(db, STORE_DOGS, dogs);
        setState((prev) => ({
          ...prev,
          planDogs: { ...prev.planDogs, [planId]: dogs },
        }));
      } catch (e) {
        console.warn(`[ReleasePlanCache] Failed to fetch dogs for plan ${planId}:`, e);
      }
    }
  }, [state.planDogs, fetchPlanDogs, getDb]);

  /** Invalidate dogs for a plan (call after mutations) */
  const invalidatePlanDogs = useCallback(async (planId: number) => {
    if (!navigator.onLine) return;
    try {
      const dogs = await fetchPlanDogs(planId);
      const db = await getDb();
      await idbDeleteByIndex(db, STORE_DOGS, "byPlan", planId);
      if (dogs.length > 0) await idbPutAll(db, STORE_DOGS, dogs);
      setState((prev) => ({
        ...prev,
        planDogs: { ...prev.planDogs, [planId]: dogs },
      }));
    } catch (e) {
      console.warn(`[ReleasePlanCache] Failed to invalidate dogs for plan ${planId}:`, e);
    }
  }, [fetchPlanDogs, getDb]);

  /** Invalidate plans (call after plan mutations) */
  const invalidatePlans = useCallback(async () => {
    if (!navigator.onLine) return;
    await syncFromServer();
  }, [syncFromServer]);

  // Initial load
  useEffect(() => {
    if (!teamIdentifier) return;
    if (navigator.onLine) {
      syncFromServer();
    } else {
      loadFromCache();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamIdentifier]);

  // Auto-refresh on reconnect
  useEffect(() => {
    const handleOnline = () => {
      if (teamIdentifier) syncFromServer();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [teamIdentifier, syncFromServer]);

  // Lazy-load dogs for visible plans
  useEffect(() => {
    for (const planId of visiblePlanIds) {
      if (!state.planDogs[planId]) {
        ensurePlanDogs(planId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePlanIds]);

  return {
    ...state,
    syncFromServer,
    ensurePlanDogs,
    invalidatePlanDogs,
    invalidatePlans,
  };
}
