/**
 * appLog — lightweight client-side activity log stored in IndexedDB.
 * Capped at MAX_ENTRIES (newest kept). Timestamps displayed in IST.
 */

const DB_NAME = "abc-buddy-cache";
const DB_VERSION = 6; // bumped to add app_log store
const LOG_STORE = "app_log";
const MAX_ENTRIES = 500;

export type LogLevel = "info" | "success" | "error" | "warn";

export interface LogEntry {
  id: string;         // UUID
  ts: number;         // UTC ms
  level: LogLevel;
  message: string;
  dogId?: string;
}

function openLogDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Preserve existing stores
      if (!db.objectStoreNames.contains("records")) db.createObjectStore("records", { keyPath: "_cacheKey" });
      if (!db.objectStoreNames.contains("recordDates")) db.createObjectStore("recordDates", { keyPath: "teamId" });
      if (!db.objectStoreNames.contains("releasePlans")) db.createObjectStore("releasePlans", { keyPath: "teamId" });
      if (!db.objectStoreNames.contains("planDogs")) db.createObjectStore("planDogs", { keyPath: "planId" });
      if (!db.objectStoreNames.contains("offline_queue")) db.createObjectStore("offline_queue", { keyPath: "queueId" });
      if (!db.objectStoreNames.contains("plan_photo_queue")) db.createObjectStore("plan_photo_queue", { keyPath: "queueId" });
      // New log store
      if (!db.objectStoreNames.contains(LOG_STORE)) {
        db.createObjectStore(LOG_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function logEvent(level: LogLevel, message: string, dogId?: string): Promise<void> {
  try {
    const db = await openLogDB();
    const entry: LogEntry = { id: makeId(), ts: Date.now(), level, message, dogId };
    const tx = db.transaction(LOG_STORE, "readwrite");
    const store = tx.objectStore(LOG_STORE);
    store.put(entry);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });

    // Trim to MAX_ENTRIES — delete oldest if over limit
    const countTx = db.transaction(LOG_STORE, "readwrite");
    const countStore = countTx.objectStore(LOG_STORE);
    const countReq = countStore.count();
    await new Promise<void>((res) => {
      countReq.onsuccess = async () => {
        const count = countReq.result;
        if (count > MAX_ENTRIES) {
          const excess = count - MAX_ENTRIES;
          const cursorReq = countStore.openCursor();
          let deleted = 0;
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor && deleted < excess) {
              cursor.delete();
              deleted++;
              cursor.continue();
            } else {
              res();
            }
          };
          cursorReq.onerror = () => res();
        } else {
          res();
        }
      };
      countReq.onerror = () => res();
    });
  } catch (e) {
    // Never throw — logging must not break the app
    console.warn("[appLog] write failed:", e);
  }
}

export async function getLogEntries(): Promise<LogEntry[]> {
  try {
    const db = await openLogDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOG_STORE, "readonly");
      const req = tx.objectStore(LOG_STORE).getAll();
      req.onsuccess = () => {
        const entries: LogEntry[] = req.result ?? [];
        // Sort newest first
        resolve(entries.sort((a, b) => b.ts - a.ts));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function clearLog(): Promise<void> {
  try {
    const db = await openLogDB();
    const tx = db.transaction(LOG_STORE, "readwrite");
    tx.objectStore(LOG_STORE).clear();
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  } catch (e) {
    console.warn("[appLog] clear failed:", e);
  }
}

/** Format a UTC ms timestamp as IST string: "03 Apr 26 14:32:05" */
export function formatIST(ts: number): string {
  return new Date(ts).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
