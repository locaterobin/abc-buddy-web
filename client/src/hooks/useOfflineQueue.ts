/**
 * useOfflineQueue — IndexedDB-backed queue for pending dog record submissions.
 * Stores full submission payloads so they can be retried after connectivity returns.
 */

const DB_NAME = "abc-buddy-cache";
const DB_VERSION = 3; // bumped to add offline_queue store
const QUEUE_STORE = "offline_queue";

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
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "queueId" });
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
