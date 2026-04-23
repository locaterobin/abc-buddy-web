import { useState, useEffect, useRef, useCallback } from "react";
import PendingReleaseBar from "@/components/PendingReleaseBar";
import {
  getPendingPlanPhotos,
  updatePlanPhotoStatus,
  removePlanPhotoFromQueue,
  type PendingPlanPhoto,
  QUEUE_CHANNEL_NAME,
} from "@/hooks/useOfflineQueue";
import { getCachedReleasePlans, getCachedReleasePlansWithMeta, setCachedReleasePlans, getCachedPlanDogs, setCachedPlanDogs } from "@/hooks/useRecordCache";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Map, Trash2, Plus, CalendarDays, Clock, CheckCircle2, Dog, GripVertical, Archive, LayoutGrid, List, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import RecordDetailModal from "@/components/RecordDetailModal";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Format a Date as a relative time string (e.g. "5 min ago", "2 hr ago")
function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)} day${Math.floor(diffHr / 24) > 1 ? "s" : ""} ago`;
}

// Format YYMMDD → "Mon, 10 Mar 2026"
function formatPlanDate(yymmdd: string): string {
  if (yymmdd.length !== 6) return yymmdd;
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const fullYear = parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`;
  const d = new Date(`${fullYear}-${mm}-${dd}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Get today's date as YYMMDD in IST
function todayYYMMDD(): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const yy = String(ist.getFullYear()).slice(2);
  const mm = String(ist.getMonth() + 1).padStart(2, "0");
  const dd = String(ist.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// Sortable dog card
function SortableDogCard({
  dog,
  onOpen,
  onRemove,
  compact = false,
  isManager = false,
}: {
  dog: any;
  onOpen: () => void;
  onRemove: () => void;
  compact?: boolean;
  isManager?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dog.dogId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  if (compact) {
    // ── List view: horizontal compact card ──────────────────────────────────
    return (
      <div ref={setNodeRef} style={style}>
        <Card className="border border-border/60 hover:border-primary/40 transition-colors overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-start gap-0">
              {/* Drag handle — left edge */}
              <button
                {...attributes}
                {...listeners}
                className="px-2 pt-2 flex items-start text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical size={16} />
              </button>

              {/* Square thumbnail */}
              <div className="cursor-pointer flex-shrink-0" onClick={onOpen}>
                {dog.imageUrl ? (
                  <img
                    src={dog.imageUrl}
                    alt={dog.dogId}
                    className="w-16 h-16 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 bg-muted flex items-center justify-center">
                    <Dog size={22} className="text-muted-foreground opacity-40" />
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 pt-2 pb-2 px-3 cursor-pointer" onClick={onOpen}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-mono font-bold text-sm text-foreground">{dog.dogId}</p>
                  {dog.releasedAt && (
                    (dog as any).releasedFar ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border border-red-300/50 dark:border-red-700/50">
                        <AlertTriangle size={9} />
                        Released Far
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-300/50 dark:border-green-700/50">
                        <CheckCircle2 size={9} />
                        Released
                      </span>
                    )
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <Clock size={10} />
                  <span>{dog.recordedAt ? new Date(dog.recordedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }) + " " + new Date(dog.recordedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : ""}</span>
                </div>
                {dog.areaName && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{dog.areaName}</p>
                )}
                {dog.releasedAt && (
                  <div className={`flex items-center gap-1 text-xs mt-0.5 font-medium flex-wrap ${
                    (dog as any).releasedFar ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                  }`}>
                    {(dog as any).releasedFar ? <AlertTriangle size={10} className="flex-shrink-0" /> : <CheckCircle2 size={10} className="flex-shrink-0" />}
                    <span>{new Date(dog.releasedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }) + " " + new Date(dog.releasedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}</span>
                    {dog.releaseAreaName && <span className="truncate">{dog.releaseAreaName}</span>}
                  </div>
                )}
              </div>

              {/* Remove button — right edge */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className={`px-3 pt-2 flex items-start hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 ${!isManager ? 'hidden' : ''}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Thumb view: full-width image card (default) ──────────────────────────
  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border border-border/60 hover:border-primary/40 transition-colors overflow-hidden">
        {/* Full-width image — clickable */}
        <div className="cursor-pointer" onClick={onOpen}>
          {dog.imageUrl ? (
            <img
              src={dog.imageUrl}
              alt={dog.dogId}
              className="w-full aspect-[4/3] object-cover"
            />
          ) : (
            <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center">
              <Dog size={40} className="text-muted-foreground opacity-40" />
            </div>
          )}
        </div>

        <CardContent className="p-3">
          {/* Info row — clickable */}
          <div className="cursor-pointer" onClick={onOpen}>
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <p className="font-mono font-bold text-sm text-foreground">{dog.dogId}</p>
              {dog.releasedAt && (
                (dog as any).releasedFar ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border border-red-300/50 dark:border-red-700/50">
                    <AlertTriangle size={9} />
                    Released Far
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-300/50 dark:border-green-700/50">
                    <CheckCircle2 size={9} />
                    Released
                  </span>
                )
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock size={11} />
              <span>{dog.recordedAt ? new Date(dog.recordedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }) + " " + new Date(dog.recordedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : ""}</span>
            </div>
            {dog.areaName && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{dog.areaName}</p>
            )}
            {dog.releasedAt && (
              <div className={`flex items-center gap-1 text-xs mt-0.5 font-medium ${
                (dog as any).releasedFar ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              }`}>
                {(dog as any).releasedFar ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
                <span>{new Date(dog.releasedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }) + " " + new Date(dog.releasedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
            )}
          </div>

          {/* Bottom row: drag handle + remove */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
            <button
              {...attributes}
              {...listeners}
              className="p-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className={`p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors ${!isManager ? 'hidden' : ''}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReleasePlanPage() {
  const { teamId: teamIdentifier } = useTeam();
  const staffSession = JSON.parse(localStorage.getItem("abc-buddy-staff-session") || "null");
  const isManager = staffSession?.role?.toLowerCase() === "manager";
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  // ── Release queue (plan photos) ─────────────────────────────────────────────
  const [pendingReleaseItems, setPendingReleaseItems] = useState<PendingPlanPhoto[]>([]);
  const [syncingReleaseIds, setSyncingReleaseIds] = useState<Set<string>>(new Set());

  const refreshReleaseQueue = useCallback(async () => {
    const all = await getPendingPlanPhotos();
    // Only show release-type items in this tab
    setPendingReleaseItems(all.filter((i) => i.type === "release"));
  }, []);

  useEffect(() => {
    refreshReleaseQueue();
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(QUEUE_CHANNEL_NAME);
      ch.onmessage = () => refreshReleaseQueue();
    } catch { /* not supported */ }
    return () => { ch?.close(); };
  }, [refreshReleaseQueue]);

  const saveReleaseMutation = trpc.dogs.saveRelease.useMutation();

  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [phoneAlertDog, setPhoneAlertDog] = useState<any>(null);
  const [dogIdFilter, setDogIdFilter] = useState("");
  // Local order state for optimistic drag reorder
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [viewMode, setViewMode] = useState<"thumb" | "list">("thumb");

  // Offline cache + last-synced timestamp
  const [cachedPlans, setCachedPlansLocal] = useState<any[]>([]);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const cacheLoadedRef = useRef(false);

  // Track online/offline state
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => {
    if (!teamIdentifier || cacheLoadedRef.current) return;
    cacheLoadedRef.current = true;
    getCachedReleasePlansWithMeta(teamIdentifier).then(({ plans, cachedAt }) => {
      setCachedPlansLocal(plans);
      if (cachedAt) setLastSynced(new Date(cachedAt));
    });
  }, [teamIdentifier]);

  const utils = trpc.useUtils();

  // ── Release queue retry handlers (need utils) ───────────────────────────────
  const retryReleaseItem = useCallback(async (item: PendingPlanPhoto) => {
    if (item.type !== "release" || !item.recordId || !item.teamIdentifier) return;
    setSyncingReleaseIds((prev) => new Set(prev).add(item.queueId));
    await updatePlanPhotoStatus(item.queueId, "syncing");
    try {
      await saveReleaseMutation.mutateAsync({
        id: item.recordId,
        teamIdentifier: item.teamIdentifier,
        releasedAt: item.releaseNotes ?? new Date().toISOString(),
        releaseLatitude: item.releaseLatitude ?? null,
        releaseLongitude: item.releaseLongitude ?? null,
        releaseAreaName: item.releaseAreaName ?? null,
        releaseDistanceMetres: item.releaseDistanceMetres ?? null,
        photo3Base64: item.photo3Base64,
      });
      await removePlanPhotoFromQueue(item.queueId);
      toast.success(`${item.captureDogId ?? "Dog"} release synced`);
      utils.releasePlans.getPlans.invalidate();
      utils.releasePlans.getPlanDogs.invalidate({ teamIdentifier: teamIdentifier ?? undefined });
    } catch (err: any) {
      await updatePlanPhotoStatus(item.queueId, "failed", err?.message || "Network error");
      toast.error(`Sync failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setSyncingReleaseIds((prev) => { const s = new Set(prev); s.delete(item.queueId); return s; });
      refreshReleaseQueue();
    }
  }, [saveReleaseMutation, utils, refreshReleaseQueue]);

  const syncAllReleases = useCallback(async () => {
    const all = await getPendingPlanPhotos();
    const releaseItems = all.filter((i) => i.type === "release");
    for (const item of releaseItems) await retryReleaseItem(item);
  }, [retryReleaseItem]);

  const discardReleaseItem = useCallback(async (queueId: string) => {
    await removePlanPhotoFromQueue(queueId);
    refreshReleaseQueue();
  }, [refreshReleaseQueue]);

  // Plans list
  const { data: freshPlans, isLoading: plansLoading } = trpc.releasePlans.getPlans.useQuery(
    { teamIdentifier },
    { enabled: !!teamIdentifier }
  );

  // Persist fresh plans to cache + background pre-fetch dogs & photos for all plans
  const prefetchedPlanIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!teamIdentifier || !freshPlans || freshPlans.length === 0) return;
    setCachedReleasePlans(teamIdentifier, freshPlans);
    setCachedPlansLocal(freshPlans);
    setLastSynced(new Date());

    // For each plan not yet pre-fetched, fetch its dogs in the background
    freshPlans.forEach((plan: any) => {
      if (prefetchedPlanIdsRef.current.has(plan.id)) return;
      prefetchedPlanIdsRef.current.add(plan.id);
      utils.releasePlans.getPlanDogs
        .fetch({ planId: plan.id, teamIdentifier: teamIdentifier ?? undefined })
        .then((dogs) => {
          if (dogs && dogs.length > 0) {
            // Cache dogs in IndexedDB
            setCachedPlanDogs(plan.id, dogs);
            // Pre-fetch annotated catch photos so SW caches them for offline use
            dogs.forEach((dog: any) => {
              const url = dog.annotatedImageUrl || dog.imageUrl;
              if (url) fetch(url, { mode: "no-cors" }).catch(() => {});
              // Pre-warm getDogPlans + getDogPlanDetails so RecordDetailModal
              // knows the dog is in a plan even when offline
              if (dog.dogId) {
                utils.releasePlans.getDogPlans
                  .prefetch({ dogId: dog.dogId, teamIdentifier: teamIdentifier ?? undefined })
                  .catch(() => {});
                utils.releasePlans.getDogPlanDetails
                  .prefetch({ dogId: dog.dogId, teamIdentifier: teamIdentifier ?? undefined })
                  .catch(() => {});
              }
            });
          }
        })
        .catch(() => {}); // silent — background only
    });
  }, [teamIdentifier, JSON.stringify(freshPlans)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use fresh data if available, otherwise fall back to cache
  const plans: any[] = freshPlans ?? cachedPlans;

  // Plan dogs cache
  const [cachedPlanDogs, setCachedPlanDogsLocal] = useState<any[]>([]);
  useEffect(() => {
    if (selectedPlanId === null) return;
    getCachedPlanDogs(selectedPlanId).then((dogs) => setCachedPlanDogsLocal(dogs));
  }, [selectedPlanId]);

  // Plan dogs (when a plan is selected)
  const { data: freshPlanDogs, isLoading: dogsLoading } = trpc.releasePlans.getPlanDogs.useQuery(
    { planId: selectedPlanId!, teamIdentifier: teamIdentifier ?? undefined },
    { enabled: selectedPlanId !== null }
  );

  // Persist fresh plan dogs to cache whenever they arrive + pre-fetch photos for SW cache
  useEffect(() => {
    if (selectedPlanId !== null && freshPlanDogs && freshPlanDogs.length >= 0) {
      setCachedPlanDogs(selectedPlanId, freshPlanDogs);
      setCachedPlanDogsLocal(freshPlanDogs);
      // Pre-fetch annotated catch photos so the service worker caches them for offline use
      freshPlanDogs.forEach((dog: any) => {
        const url = dog.annotatedImageUrl || dog.imageUrl;
        if (url) fetch(url, { mode: "no-cors" }).catch(() => {});
        // Pre-warm plan membership queries so RecordDetailModal shows correct
        // buttons (Mark as Released, not Add to plan) when offline
        if (dog.dogId) {
          utils.releasePlans.getDogPlans
            .prefetch({ dogId: dog.dogId, teamIdentifier: teamIdentifier ?? undefined })
            .catch(() => {});
          utils.releasePlans.getDogPlanDetails
            .prefetch({ dogId: dog.dogId, teamIdentifier: teamIdentifier ?? undefined })
            .catch(() => {});
        }
      });
    }
  }, [selectedPlanId, JSON.stringify(freshPlanDogs)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use fresh data if available, otherwise fall back to cache
  const planDogs: any[] = freshPlanDogs ?? cachedPlanDogs;

  // Reset local order whenever server data refreshes
  const planDogsKey = planDogs.map((d) => d.dogId).join(",");
  // We use a ref-free approach: if localOrder has same set as planDogs, keep it; otherwise reset
  // (handled in orderedDogs computation below)

  const createPlan = trpc.releasePlans.createPlan.useMutation({
    onSuccess: () => {
      utils.releasePlans.getPlans.invalidate();
      toast.success("Release plan created");
    },
    onError: () => toast.error("Failed to create plan"),
  });

  const deletePlan = trpc.releasePlans.deletePlan.useMutation({
    onSuccess: () => {
      utils.releasePlans.getPlans.invalidate();
      setSelectedPlanId(null);
      toast.success("Plan deleted");
    },
    onError: () => toast.error("Failed to delete plan"),
  });

  const removeDog = trpc.releasePlans.removeDog.useMutation({
    onSuccess: () => {
      utils.releasePlans.getPlanDogs.invalidate({ planId: selectedPlanId!, teamIdentifier: teamIdentifier ?? undefined });
      toast.success("Dog removed from plan");
    },
    onError: () => toast.error("Failed to remove dog"),
  });

  const reorderDogs = trpc.releasePlans.reorderDogs.useMutation({
    onError: () => {
      setLocalOrder(null);
      toast.error("Failed to save order");
    },
  });

  const archivePlan = trpc.releasePlans.archivePlan.useMutation({
    onSuccess: () => {
      utils.releasePlans.getPlans.invalidate();
      toast.success("Plan archived");
    },
    onError: () => toast.error("Failed to archive plan"),
  });

  function handleCreatePlan() {
    if (!teamIdentifier) return;
    const date = todayYYMMDD();
    createPlan.mutate({ teamIdentifier, planDate: date });
  }

  function buildMapsUrl(dogs: typeof planDogs): string {
    const coords = dogs
      .filter((d) => d.latitude != null && d.longitude != null)
      .map((d) => `${d.latitude},${d.longitude}`);
    if (coords.length === 0) return "";
    if (coords.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${coords[0]}`;
    }
    const origin = coords[0];
    const destination = coords[coords.length - 1];
    const waypoints = coords.slice(1, -1).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    return url;
  }

  // Drag sensors — pointer (mouse/stylus) + touch
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Ordered dogs list (local optimistic order takes priority)
  const orderedDogs = localOrder
    ? localOrder.map((id) => planDogs.find((d) => d.dogId === id)).filter(Boolean) as typeof planDogs
    : planDogs;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = orderedDogs.map((d) => d.dogId);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(newOrder);

    reorderDogs.mutate(
      { planId: selectedPlanId!, orderedDogIds: newOrder, teamIdentifier: teamIdentifier ?? '' },
      {
        onSuccess: () => {
          utils.releasePlans.getPlanDogs.invalidate({ planId: selectedPlanId!, teamIdentifier: teamIdentifier ?? undefined });
        },
      }
    );
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  // ── Plan Detail View ──────────────────────────────────────────────────────────
  if (selectedPlanId !== null && selectedPlan) {
    const mapsUrl = buildMapsUrl(orderedDogs);
    const dogsWithCoords = orderedDogs.filter((d) => d.latitude != null && d.longitude != null);

    return (
      <>
        <div className="flex flex-col h-full bg-background">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
            <button
              onClick={() => setSelectedPlanId(null)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-foreground text-base leading-tight">
                Plan {selectedPlan.planDate}-{selectedPlan.orderIndex}
              </h2>
              <p className="text-xs text-muted-foreground">{formatPlanDate(selectedPlan.planDate)}</p>
            </div>
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border overflow-hidden flex-shrink-0">
              <button
                onClick={() => setViewMode("thumb")}
                className={`p-1.5 transition-colors ${
                  viewMode === "thumb"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                title="Thumbnail view"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 transition-colors ${
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                title="List view"
              >
                <List size={15} />
              </button>
            </div>
            {planDogs.length === 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                onClick={() => {
                  if (confirm("Delete this entire release plan?")) {
                    deletePlan.mutate({ planId: selectedPlanId, teamIdentifier });
                  }
                }}
              >
                <Trash2 size={16} />
              </Button>
            )}
          </div>

          {/* ID filter */}
          <div className="px-4 pt-3">
            <input
              type="text"
              value={dogIdFilter}
              onChange={(e) => setDogIdFilter(e.target.value)}
              placeholder="Filter by ID…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Dogs list */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
            {dogsLoading ? (
              <div className="text-center text-muted-foreground py-8 text-sm">Loading…</div>
            ) : orderedDogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-sm">
                <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
                No dogs in this plan yet.
                <br />
                Open a record and tap "Add to Release Plan".
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={orderedDogs.map((d) => d.dogId)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedDogs.filter((d) => !dogIdFilter || d.dogId.toLowerCase().includes(dogIdFilter.toLowerCase())).map((dog) => (
                    <SortableDogCard
                      key={dog.dogId}
                      dog={dog}
                      compact={viewMode === "list"}
                      onOpen={() => {
                        const notes = dog.notes ?? "";
                        if (/\d{10,}/.test(notes.replace(/[\s\-().+]/g, ""))) {
                          setPhoneAlertDog(dog);
                        } else {
                          setSelectedRecord(dog);
                        }
                      }}
                      isManager={isManager}
                      onRemove={() => removeDog.mutate({ planId: selectedPlanId!, dogId: dog.dogId, teamIdentifier: teamIdentifier ?? '' })}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Phone alert modal */}
        {phoneAlertDog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-background rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
              <div className="flex items-center justify-center gap-2">
                <AlertTriangle size={22} className="text-destructive flex-shrink-0" />
                <p className="text-lg font-bold text-destructive uppercase tracking-wide">Call animal's person!</p>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                {phoneAlertDog.notes?.split(/(\d{10,})/).map((part: string, i: number) =>
                  /^\d{10,}$/.test(part)
                    ? <a key={i} href={`tel:${part}`} className="text-primary underline font-medium">{part}</a>
                    : part
                )}
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  className="flex-1 rounded-lg border border-border py-2 text-sm text-muted-foreground"
                  onClick={() => setPhoneAlertDog(null)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 rounded-lg bg-primary text-primary-foreground py-2 text-sm font-medium"
                  onClick={() => { setSelectedRecord(phoneAlertDog); setPhoneAlertDog(null); }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Record Detail Modal */}
        {selectedRecord && (
          <RecordDetailModal
            record={selectedRecord}
            onClose={() => {
              setSelectedRecord(null);
              utils.releasePlans.getPlanDogs.invalidate({ teamIdentifier: teamIdentifier ?? undefined });
            }}
            onDelete={() => {
              setSelectedRecord(null);
              utils.releasePlans.getPlanDogs.invalidate({ teamIdentifier: teamIdentifier ?? undefined });
            }}
          />
        )}
      </>
    );
  }

  // ── Plans List View ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Offline / last-synced notice */}
      {(isOffline || (lastSynced && !freshPlans)) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
          <WifiOff size={13} className="flex-shrink-0" />
          <span className="flex-1">
            {isOffline ? "You are offline" : "Using cached data"}
            {lastSynced ? ` · Last synced ${formatRelativeTime(lastSynced)}` : " · No cache available"}
          </span>
          {!isOffline && (
            <button
              onClick={() => utils.releasePlans.getPlans.invalidate()}
              className="flex items-center gap-1 text-amber-700 hover:text-amber-900 font-medium"
            >
              <RefreshCw size={11} /> Refresh
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <h2 className="font-bold text-foreground text-base">Release Plans</h2>
        {isManager && (
          <Button
            size="sm"
            onClick={handleCreatePlan}
            disabled={createPlan.isPending}
            className="gap-1.5"
          >
            <Plus size={15} />
            New Plan
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
        {plansLoading ? (
          <div className="text-center text-muted-foreground py-8 text-sm">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">
            <CalendarDays size={40} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No release plans yet</p>
            <p className="text-xs mt-1">Tap "New Plan" to create one for today.</p>
          </div>
        ) : (
          plans.map((plan) => (
            <Card
              key={plan.id}
              className="border border-border/60 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
              onClick={() => setSelectedPlanId(plan.id)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <CalendarDays size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-foreground text-sm">{plan.planDate}-{plan.orderIndex}</p>
                    {(plan as any).totalDogs > 0 && (plan as any).releasedDogs === (plan as any).totalDogs && (
                      (plan as any).anyReleasedFar ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 border border-red-500/30 inline-flex items-center gap-0.5">
                          <AlertTriangle size={9} />Completed
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-600 border border-green-500/30">Completed</span>
                      )
                    )}
                    {(plan as any).totalDogs > 1 && (plan as any).releasedDogs > 0 && (plan as any).releasedDogs < (plan as any).totalDogs && (
                      (plan as any).anyReleasedFar ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-600 border border-red-500/30 inline-flex items-center gap-0.5">
                          <AlertTriangle size={9} />In Progress
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-600 border border-yellow-500/30">In Progress</span>
                      )
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatPlanDate(plan.planDate)}{(plan as any).totalDogs > 0 ? ` · ${(plan as any).totalDogs} dogs` : ''}</p>
                </div>
                {isManager && (() => {
                  const totalDogs = (plan as any).totalDogs ?? 0;
                  const releasedDogs = (plan as any).releasedDogs ?? 0;
                  const isInProgress = totalDogs > 0 && releasedDogs > 0 && releasedDogs < totalDogs;
                  if (isInProgress) return null;
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Archive plan ${plan.planDate}-${plan.orderIndex}? It will be hidden from this list.`)) {
                          archivePlan.mutate({ planId: plan.id, teamIdentifier });
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      title="Archive plan"
                    >
                      <Archive size={16} />
                    </button>
                  );
                })()}
                <ArrowLeft size={16} className="text-muted-foreground rotate-180" />
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <PendingReleaseBar
        items={pendingReleaseItems}
        syncingIds={syncingReleaseIds}
        onRetry={retryReleaseItem}
        onDiscard={discardReleaseItem}
        onSyncAll={syncAllReleases}
      />
    </div>
  );
}
