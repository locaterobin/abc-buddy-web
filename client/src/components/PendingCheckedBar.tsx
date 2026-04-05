import { useState } from "react";
import { ChevronUp, ChevronDown, RefreshCw, Trash2, Loader2, CloudOff } from "lucide-react";
import { type PendingPlanPhoto } from "@/hooks/useOfflineQueue";

function formatAge(ts: number): string {
  const ms = Date.now() - ts;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface PendingCheckedBarProps {
  items: PendingPlanPhoto[];
  syncingIds: Set<string>;
  onRetry: (item: PendingPlanPhoto) => void;
  onDiscard: (queueId: string) => void;
  onSyncAll: () => void;
}

export default function PendingCheckedBar({
  items,
  syncingIds,
  onRetry,
  onDiscard,
  onSyncAll,
}: PendingCheckedBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  const failedCount = items.filter((r) => r.status === "failed").length;
  const isBusy = syncingIds.size > 0;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 flex justify-center pointer-events-none">
      <div
        className="w-full max-w-lg mx-auto pointer-events-auto"
        style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      >
        {/* Expanded list */}
        {expanded && (
          <div className="mx-3 mb-1 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/90 dark:border-amber-700 shadow-lg overflow-hidden">
            <div className="max-h-56 overflow-y-auto divide-y divide-amber-200 dark:divide-amber-800">
              {items.map((item, idx) => {
                const isSyncing = syncingIds.has(item.queueId);
                const label = item.dogId ?? "Plan add";
                const photo = item.photo2Base64;
                return (
                  <div
                    key={item.queueId}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
                  >
                    {/* Number badge */}
                    <span className="shrink-0 w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>

                    {/* Thumbnail */}
                    {photo && (
                      <img
                        src={photo}
                        alt={label}
                        className="w-8 h-8 rounded object-cover flex-shrink-0"
                      />
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono font-bold text-[11px] text-amber-900 dark:text-amber-100 truncate">
                        {label}
                      </p>
                      <p className="text-[10px] text-amber-500 dark:text-amber-500">
                        Plan add · {formatAge(item.queuedAt)}
                        {item.status === "failed" && (
                          <span className="ml-1 text-red-500">· failed</span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => onRetry(item)}
                        disabled={isSyncing}
                        className="p-1 rounded text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800 disabled:opacity-40"
                        title="Retry"
                      >
                        {isSyncing ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <RefreshCw size={13} />
                        )}
                      </button>
                      <button
                        onClick={() => onDiscard(item.queueId)}
                        disabled={isSyncing}
                        className="p-1 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-40"
                        title="Discard"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsed bar / pill */}
        <div className="mx-3 mb-1 rounded-xl bg-amber-500 dark:bg-amber-600 shadow-lg flex items-center overflow-hidden">
          {/* Left: toggle expand */}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="flex-1 flex items-center gap-2 px-3 py-2.5 text-white text-sm font-medium"
          >
            <CloudOff size={14} className="shrink-0" />
            <span>
              {items.length} plan add{items.length !== 1 ? "s" : ""} pending sync
              {failedCount > 0 && (
                <span className="ml-1 text-amber-100">({failedCount} failed)</span>
              )}
            </span>
            {expanded ? (
              <ChevronDown size={14} className="ml-auto shrink-0" />
            ) : (
              <ChevronUp size={14} className="ml-auto shrink-0" />
            )}
          </button>

          {/* Right: Sync All */}
          <button
            onClick={onSyncAll}
            disabled={isBusy}
            className="shrink-0 px-3 py-2.5 border-l border-amber-400 dark:border-amber-500 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-60"
          >
            {isBusy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Sync All
          </button>
        </div>
      </div>
    </div>
  );
}
