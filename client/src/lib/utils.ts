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
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.toISOString().replace("T", " ").slice(0, 19);
}
