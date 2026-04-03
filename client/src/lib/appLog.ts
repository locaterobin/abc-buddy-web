/**
 * appLog — lightweight client-side activity log stored in localStorage as a JSON array.
 * Synchronous writes — no async, no IndexedDB. Capped at MAX_ENTRIES (oldest trimmed).
 * Timestamps displayed in IST.
 */

const STORAGE_KEY = "abc-buddy-activity-log";
const MAX_ENTRIES = 500;

export type LogLevel = "info" | "success" | "error" | "warn";

export interface LogEntry {
  id: string;       // unique ID
  ts: number;       // UTC ms
  level: LogLevel;
  message: string;
  dogId?: string;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Write a log entry synchronously to localStorage. Never throws. */
export function logEvent(level: LogLevel, message: string, dogId?: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries: LogEntry[] = raw ? JSON.parse(raw) : [];
    const entry: LogEntry = { id: makeId(), ts: Date.now(), level, message, dogId };
    entries.push(entry);
    // Trim oldest entries if over limit
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    // Never throw — logging must not break the app
    console.warn("[appLog] write failed:", e);
  }
}

/** Read all log entries, newest first. */
export function getLogEntries(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries: LogEntry[] = raw ? JSON.parse(raw) : [];
    return entries.slice().sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

/** Clear all log entries. */
export function clearLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
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
