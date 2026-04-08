import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a Date, ms timestamp, or ISO string to an IST datetime string for webhook payloads.
 * Format: "YYYY-MM-DD HH:mm:ss" in Asia/Kolkata (UTC+5:30).
 */
export function toISTString(date: Date | number | string): string {
  const d = new Date(date as any);
  // Use Intl to get correct IST parts without manual offset arithmetic
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(f.formatToParts(d).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
