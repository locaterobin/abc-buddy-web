/**
 * useOfflineQueue — IndexedDB-backed queue for pending dog record submissions.
 * Stores full submission payloads so they can be retried after connectivity returns.
 */

const DB_NAME = "abc-buddy-cache";
const DB_VERSION = 6; // v6: added app_log store
const QUEUE_STORE = "offline_queue";
const PLAN_PHOTO_QUEUE_STORE = "plan_photo_queue";

export type QueueStatus = "pending" | "syncing" | "failed";

export interface PendingRecord {
  queueId: string;        // UUID assigned at queue time
  teamIdentifier: string;
  dogId: string;
  imageBase64: string;
  originalImageBase64?: string;
  description?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  areaName?: string;
  source: "camera" | "upload";
  recordedAt: number;     // UTC ms
  webhookUrl?: string;
  status: QueueStatus;
  queuedAt: number;       // UTC ms
  errorMessage?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")) {
        db.createObjectStore("records", { keyPath: "_cacheKey" });
      }
      if (!db.objectStoreNames.contains("recordDates")) {
        db.createObjectStore("recordDates", { keyPath: "teamId" });
      }
      if (!db.objectStoreNames.contains("releasePlans")) {
        db.createObjectStore("releasePlans", { keyPath: "teamId" });
      }
      if (!db.objectStoreNames.contains("planDogs")) {
        db.createObjectStore("planDogs", { keyPath: "planId" });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "queueId" });
      }
      if (!db.objectStoreNames.contains(PLAN_PHOTO_QUEUE_STORE)) {
        db.createObjectStore(PLAN_PHOTO_QUEUE_STORE, { keyPath: "queueId" });
      }
      if (!db.objectStoreNames.contains("app_log")) {
        db.createObjectStore("app_log", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueRecord(record: Omit<PendingRecord, "status" | "queuedAt">): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put({
      ...record,
      status: "pending" as QueueStatus,
      queuedAt: Date.now(),
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB queue write failed:", e);
  }
}

export async function getPendingRecords(teamIdentifier: string): Promise<PendingRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const req = tx.objectStore(QUEUE_STORE).getAll();
      req.onsuccess = () => {
        const all: PendingRecord[] = req.result ?? [];
        resolve(all.filter((r) => r.teamIdentifier === teamIdentifier));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function updateQueueStatus(
  queueId: string,
  status: QueueStatus,
  errorMessage?: string
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const getReq = store.get(queueId);
    await new Promise<void>((res, rej) => {
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          store.put({ ...record, status, errorMessage: errorMessage ?? record.errorMessage });
        }
        res();
      };
      getReq.onerror = () => rej(getReq.error);
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB queue status update failed:", e);
  }
}

export async function removeFromQueue(queueId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(queueId);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.warn("IndexedDB queue delete failed:", e);
  }
}

// ── Plan Photo Queue ──────────────────────────────────────────────────────────

export type PlanPhotoType = "checked" | "release";

export interface PendingPlanPhoto {
  queueId: string;
  type: PlanPhotoType;
  // For "checked": addDogToPlan payload
  planId?: number;
  dogId?: string;
  photo2Base64?: string;
  // For "release": saveRelease payload
  recordId?: number;
  teamIdentifier?: string;
  photo3Base64?: string;
  releaseNotes?: string;
  webhookUrl?: string;
  status: QueueStatus;
  queuedAt: number;
  errorMessage?: string;
}

async function openPlanPhotoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "_cacheKey" });
      if (!db.objectStoreNames.contains("recordDates")) db.createObjectStore("recordDates", { keyPath: "teamId" });
      if (!db.objectStoreNames.contains("releasePlans")) db.createObjectStore("releasePlans", { keyPath: "teamId" });
      if (!db.objectStoreNames.contains("planDogs")) db.createObjectStore("planDogs", { keyPath: "planId" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "queueId" });
      if (!db.objectStoreNames.contains(PLAN_PHOTO_QUEUE_STORE)) db.createObjectStore(PLAN_PHOTO_QUEUE_STORE, { keyPath: "queueId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueuePlanPhoto(item: Omit<PendingPlanPhoto, "status" | "queuedAt">): Promise<void> {
  try {
    const db = await openPlanPhotoDB();
    const tx = db.transaction(PLAN_PHOTO_QUEUE_STORE, "readwrite");
    tx.objectStore(PLAN_PHOTO_QUEUE_STORE).put({ ...item, status: "pending" as QueueStatus, queuedAt: Date.now() });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn("IndexedDB plan photo queue write failed:", e); }
}

export async function getPendingPlanPhotos(): Promise<PendingPlanPhoto[]> {
  try {
    const db = await openPlanPhotoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PLAN_PHOTO_QUEUE_STORE, "readonly");
      const req = tx.objectStore(PLAN_PHOTO_QUEUE_STORE).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function updatePlanPhotoStatus(queueId: string, status: QueueStatus, errorMessage?: string): Promise<void> {
  try {
    const db = await openPlanPhotoDB();
    const tx = db.transaction(PLAN_PHOTO_QUEUE_STORE, "readwrite");
    const store = tx.objectStore(PLAN_PHOTO_QUEUE_STORE);
    const getReq = store.get(queueId);
    await new Promise<void>((res, rej) => {
      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) store.put({ ...item, status, errorMessage: errorMessage ?? item.errorMessage });
        res();
      };
      getReq.onerror = () => rej(getReq.error);
    });
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn("IndexedDB plan photo status update failed:", e); }
}

export async function removePlanPhotoFromQueue(queueId: string): Promise<void> {
  try {
    const db = await openPlanPhotoDB();
    const tx = db.transaction(PLAN_PHOTO_QUEUE_STORE, "readwrite");
    tx.objectStore(PLAN_PHOTO_QUEUE_STORE).delete(queueId);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  } catch (e) { console.warn("IndexedDB plan photo queue delete failed:", e); }
}
