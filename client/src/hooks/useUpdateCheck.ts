/**
 * useUpdateCheck — polls /api/version every 5 minutes.
 * When a new version is detected (different from the one loaded at startup),
 * calls onUpdateAvailable so the app can prompt the user to refresh.
 */
import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

export function useUpdateCheck(onUpdateAvailable: () => void) {
  const baselineVersion = useRef<string | null>(null);
  const notified = useRef(false);

  useEffect(() => {
    // Capture the version that was running when the page first loaded
    fetchVersion().then((v) => {
      baselineVersion.current = v;
    });

    const interval = setInterval(async () => {
      if (notified.current) return; // already prompted, don't spam
      const current = await fetchVersion();
      if (
        current !== null &&
        baselineVersion.current !== null &&
        current !== baselineVersion.current
      ) {
        notified.current = true;
        onUpdateAvailable();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
