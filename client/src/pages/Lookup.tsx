import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { resizeImage } from "@/lib/resizeImage";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  Upload,
  Camera,
  Loader2,
  Clock,
  MapPin,
  X,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import RecordDetailModal from "@/components/RecordDetailModal";
import { getCachedRecordDates, setCachedRecordDates, getCachedRecords } from "@/hooks/useRecordCache";
import {
  getPendingRecords,
  removeFromQueue,
  updateQueueStatus,
  type PendingRecord,
  getPendingPlanPhotos,
  removePlanPhotoFromQueue,
  updatePlanPhotoStatus,
  type PendingPlanPhoto,
} from "@/hooks/useOfflineQueue";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Format a YYYY-MM-DD string as "Mon, 10 Mar 2026" in IST */
function formatDateOption(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00+05:30");
  return d.toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Format how long ago a timestamp was (e.g. "queued 2h ago", "queued 35m ago") */
function formatAge(ts: number): string {
  const ms = Date.now() - ts;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "queued just now";
  if (mins < 60) return `queued ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `queued ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `queued ${days}d ago`;
}

/** Convert timeRange value to dateFrom / dateTo for getRecordsPaginated */
function timeRangeToDateFilter(timeRange: string): { dateFrom?: string; dateTo?: string } {
  if (timeRange === "24hours") {
    const d = new Date();
    d.setHours(d.getHours() - 24);
    return { dateFrom: d.toISOString().slice(0, 10) };
  }
  if (timeRange === "48hours") {
    const d = new Date();
    d.setHours(d.getHours() - 48);
    return { dateFrom: d.toISOString().slice(0, 10) };
  }
  if (timeRange === "7days") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { dateFrom: d.toISOString().slice(0, 10) };
  }
  if (timeRange === "30days") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return { dateFrom: d.toISOString().slice(0, 10) };
  }
  // Specific date
  return { dateFrom: timeRange, dateTo: timeRange };
}

export default function Lookup() {
  const { teamId, webhookUrl } = useTeam();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [timeRange, setTimeRange] = useState<string>(
    () => localStorage.getItem("lookup-date-selection") ?? ""
  );
  const [imageBase64, setImageBase64] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  // Offline queue state
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([]);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  // Plan photo offline queue state
  const [pendingPlanPhotos, setPendingPlanPhotos] = useState<PendingPlanPhoto[]>([]);
  const [syncingPlanIds, setSyncingPlanIds] = useState<Set<string>>(new Set());

  const lookupMutation = trpc.dogs.lookupDog.useMutation();
  const saveMutation = trpc.dogs.saveRecord.useMutation();
  const annotateMutation = trpc.dogs.annotateRecord.useMutation();
  const utils = trpc.useUtils();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      await utils.dogs.getRecordDates.invalidate();
      await utils.dogs.getRecordsPaginated.invalidate();
      await utils.dogs.getRecords.invalidate();
    } finally {
      setIsSyncing(false);
    }
  }, [utils]);

  // Cached dates and records for offline support
  // Use lazy useState initialiser so IndexedDB is read once synchronously via a
  // module-level promise that resolves before the second render.
  const [cachedDates, setCachedDates] = useState<string[]>([]);
  const [cachedRecords, setCachedRecordsLocal] = useState<any[]>([]);
  const cacheLoadedRef = useRef(false);
  useEffect(() => {
    if (!teamId || cacheLoadedRef.current) return;
    cacheLoadedRef.current = true;
    Promise.all([
      getCachedRecordDates(teamId),
      getCachedRecords(teamId),
    ]).then(([dates, records]) => {
      setCachedDates(dates);
      setCachedRecordsLocal(records);
    });
  }, [teamId]);

  // Load pending queue
  const refreshQueue = useCallback(async () => {
    if (!teamId) return;
    const items = await getPendingRecords(teamId);
    setPendingRecords(items);
  }, [teamId]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // Load plan photo queue
  const refreshPlanPhotoQueue = useCallback(async () => {
    const items = await getPendingPlanPhotos();
    setPendingPlanPhotos(items);
  }, []);

  useEffect(() => {
    refreshPlanPhotoQueue();
  }, [refreshPlanPhotoQueue]);

  // Fetch distinct dates that have records
  const { data: datesData } = trpc.dogs.getRecordDates.useQuery(
    { teamIdentifier: teamId },
    { enabled: !!teamId, staleTime: 60_000 }
  );
  const freshDates: string[] = datesData?.dates ?? [];

  // Persist fresh dates to IndexedDB whenever they arrive
  useEffect(() => {
    if (teamId && freshDates.length > 0) {
      setCachedRecordDates(teamId, freshDates);
      setCachedDates(freshDates);
    }
  }, [teamId, freshDates.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const recordDates: string[] = freshDates.length > 0 ? freshDates : cachedDates;

  // Default to latest date once dates are available
  useEffect(() => {
    if (!timeRange && recordDates.length > 0) {
      setTimeRange(recordDates[0]);
    }
  }, [recordDates, timeRange]);

  // Default list: all records in the selected time range (no photo needed)
  const { dateFrom, dateTo } = timeRangeToDateFilter(timeRange);
  const defaultListQuery = trpc.dogs.getRecordsPaginated.useQuery(
    {
      teamIdentifier: teamId,
      page: 1,
      pageSize: 100,
      dateFrom,
      dateTo,
      status: "active",
    },
    { enabled: !!teamId && !lookupMutation.isSuccess }
  );
  // Filter cached records by the selected time range for offline fallback
  function filterCachedByTimeRange(records: any[], tr: string): any[] {
    const { dateFrom, dateTo } = timeRangeToDateFilter(tr);
    return records.filter((r) => {
      const d = new Date(r.recordedAt).toISOString().slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      if (r.releasedAt) return false; // only active
      return true;
    });
  }

  // Show cached records whenever server data is not yet available (offline, loading, or error)
  const serverRecords = defaultListQuery.data?.records;
  const defaultRecords: any[] = serverRecords ?? filterCachedByTimeRange(cachedRecords, timeRange);

  const handleFile = useCallback(async (file: File) => {
    try {
      const rawBase64 = await fileToBase64(file);
      const base64 = await resizeImage(rawBase64, 1280, 0.82);
      setImageBase64(base64);
    } catch {
      toast.error("Failed to read image");
    }
  }, []);

  // Auto-search when image is set
  useEffect(() => {
    if (!imageBase64 || !teamId) return;
    lookupMutation.mutate(
      { teamIdentifier: teamId, imageBase64, timeRange },
      { onError: (err) => toast.error("Search failed: " + err.message) }
    );
  }, [imageBase64]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry a single pending record
  const retryRecord = useCallback(async (item: PendingRecord) => {
    setSyncingIds((prev) => new Set(prev).add(item.queueId));
    await updateQueueStatus(item.queueId, "syncing");

    try {
      let finalImageBase64 = item.imageBase64;
      if (item.source === "camera") {
        try {
          const annotated = await annotateMutation.mutateAsync({
            imageBase64: item.imageBase64,
            dogId: item.dogId,
            recordedAt: new Date(item.recordedAt).toISOString(),
            areaName: item.areaName,
            latitude: item.latitude,
            longitude: item.longitude,
            notes: item.notes,
          });
          finalImageBase64 = annotated.annotatedBase64;
        } catch {
          // annotation failure is non-fatal
        }
      }

      await saveMutation.mutateAsync({
        teamIdentifier: item.teamIdentifier,
        dogId: item.dogId,
        imageBase64: finalImageBase64,
        originalImageBase64: finalImageBase64 !== item.imageBase64 ? item.imageBase64 : undefined,
        description: item.description,
        notes: item.notes,
        latitude: item.latitude,
        longitude: item.longitude,
        areaName: item.areaName,
        source: item.source,
        recordedAt: item.recordedAt,
        webhookUrl: item.webhookUrl,
      });

      await removeFromQueue(item.queueId);
      toast.success(`${item.dogId} synced!`);
      utils.dogs.getRecords.invalidate();
    } catch (err: any) {
      await updateQueueStatus(item.queueId, "failed", err?.message ?? "Unknown error");
      toast.error(`${item.dogId} sync failed: ${err?.message ?? "Unknown error"}`);
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.queueId);
        return next;
      });
      refreshQueue();
    }
  }, [annotateMutation, saveMutation, utils, refreshQueue]);

  // Sync all pending records sequentially
  const syncAll = useCallback(async () => {
    const items = await getPendingRecords(teamId);
    for (const item of items) {
      await retryRecord(item);
    }
  }, [teamId, retryRecord]);

  // Discard a pending record from the queue
  const discardRecord = useCallback(async (queueId: string) => {
    await removeFromQueue(queueId);
    refreshQueue();
  }, [refreshQueue]);

  // Retry a single plan photo
  const retryPlanPhoto = useCallback(async (item: PendingPlanPhoto) => {
    setSyncingPlanIds((prev) => new Set(prev).add(item.queueId));
    await updatePlanPhotoStatus(item.queueId, "syncing");
    try {
      if (item.type === "checked" && item.planId && item.dogId) {
        await utils.client.releasePlans.addDog.mutate({
          planId: item.planId,
          dogId: item.dogId,
          photo2Base64: item.photo2Base64,
        });
      } else if (item.type === "release" && item.recordId && item.teamIdentifier) {
        await utils.client.dogs.saveRelease.mutate({
          id: item.recordId,
          teamIdentifier: item.teamIdentifier,
          releasedAt: item.releaseNotes ?? new Date().toISOString(),
          releaseLatitude: null,
          releaseLongitude: null,
          releaseAreaName: null,
          releaseDistanceMetres: null,
          photo3Base64: item.photo3Base64,
        });
      }
      await removePlanPhotoFromQueue(item.queueId);
      toast.success("Plan photo synced");
    } catch (err: any) {
      await updatePlanPhotoStatus(item.queueId, "failed", err?.message || "Network error");
    } finally {
      setSyncingPlanIds((prev) => { const s = new Set(prev); s.delete(item.queueId); return s; });
      refreshPlanPhotoQueue();
    }
  }, [utils, refreshPlanPhotoQueue]);

  const syncAllPlanPhotos = useCallback(async () => {
    const items = await getPendingPlanPhotos();
    for (const item of items) await retryPlanPhoto(item);
  }, [retryPlanPhoto]);

  const discardPlanPhoto = useCallback(async (queueId: string) => {
    await removePlanPhotoFromQueue(queueId);
    refreshPlanPhotoQueue();
  }, [refreshPlanPhotoQueue]);

  // Auto-retry when device comes back online
  useEffect(() => {
    const handleOnline = async () => {
      const items = await getPendingRecords(teamId);
      if (items.length > 0) {
        for (const item of items) {
          await retryRecord(item);
        }
      }
      const planItems = await getPendingPlanPhotos();
      if (planItems.length > 0) {
        for (const item of planItems) await retryPlanPhoto(item);
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [teamId, retryRecord, retryPlanPhoto]);

  const confidenceConfig = {
    high: { label: "High match", className: "bg-green-100 text-green-800 border-green-200" },
    medium: { label: "Possible match", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    low: { label: "Low match", className: "bg-gray-100 text-gray-600 border-gray-200" },
  };

  const matches = lookupMutation.data?.matches || [];

  // Which list to show
  const showSearchResults = lookupMutation.isSuccess || lookupMutation.isPending;

  return (
    <div className="container py-4 pb-6 max-w-lg mx-auto space-y-4">

      {/* Pending / failed queue banner */}
      {pendingRecords.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium text-sm">
                <AlertTriangle size={15} />
                {pendingRecords.length} record{pendingRecords.length !== 1 ? "s" : ""} pending sync
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-amber-400 text-amber-800 dark:text-amber-300 bg-transparent"
                onClick={syncAll}
                disabled={syncingIds.size > 0}
              >
                {syncingIds.size > 0 ? (
                  <Loader2 size={12} className="mr-1 animate-spin" />
                ) : (
                  <RefreshCw size={12} className="mr-1" />
                )}
                Sync All
              </Button>
            </div>
            {pendingRecords.map((item) => {
              const isSyncing = syncingIds.has(item.queueId);
              return (
                <div
                  key={item.queueId}
                  className="flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-400"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.imageBase64 && (
                      <img
                        src={item.imageBase64}
                        alt={item.dogId}
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-sm text-amber-900 dark:text-amber-200">
                        {item.dogId}
                      </p>
                      {item.areaName && (
                        <p className="truncate text-amber-600 dark:text-amber-500">{item.areaName}</p>
                      )}
                      <p className="text-amber-500 dark:text-amber-600 text-[10px]">{formatAge(item.queuedAt)}</p>
                      {item.status === "failed" && item.errorMessage && (
                        <p className="text-red-600 dark:text-red-400 truncate">{item.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-400 text-amber-800 dark:text-amber-300 bg-transparent"
                      onClick={() => retryRecord(item)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-300 text-red-600 dark:text-red-400 bg-transparent"
                      onClick={() => discardRecord(item.queueId)}
                      disabled={isSyncing}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Pending plan photos banner */}
      {pendingPlanPhotos.length > 0 && (
        <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700">
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-medium text-sm">
                <AlertTriangle size={15} />
                {pendingPlanPhotos.length} plan action{pendingPlanPhotos.length !== 1 ? "s" : ""} pending sync
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-blue-400 text-blue-800 dark:text-blue-300 bg-transparent"
                onClick={syncAllPlanPhotos}
                disabled={syncingPlanIds.size > 0}
              >
                {syncingPlanIds.size > 0 ? (
                  <Loader2 size={12} className="mr-1 animate-spin" />
                ) : (
                  <RefreshCw size={12} className="mr-1" />
                )}
                Sync All
              </Button>
            </div>
            {pendingPlanPhotos.map((item) => {
              const isSyncing = syncingPlanIds.has(item.queueId);
              return (
                <div
                  key={item.queueId}
                  className="flex items-center justify-between gap-2 text-xs text-blue-700 dark:text-blue-400"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {(item.photo2Base64 || item.photo3Base64) && (
                      <img
                        src={item.photo2Base64 ?? item.photo3Base64}
                        alt="plan photo"
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-mono font-bold text-sm text-blue-900 dark:text-blue-200">
                        {item.dogId ?? (item.type === "release" ? "Release" : "Checked")} — {item.type}
                      </p>
                      <p className="text-blue-500 dark:text-blue-600 text-[10px]">{formatAge(item.queuedAt)}</p>
                      {item.status === "failed" && item.errorMessage && (
                        <p className="text-red-600 dark:text-red-400 truncate">{item.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-blue-400 text-blue-800 dark:text-blue-300 bg-transparent"
                      onClick={() => retryPlanPhoto(item)}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <RefreshCw size={12} />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-300 text-red-600 dark:text-red-400 bg-transparent"
                      onClick={() => discardPlanPhoto(item.queueId)}
                      disabled={isSyncing}
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Date Range Dropdown + Sync */}
      <div className="flex gap-2">
      <div className="flex-1">
      <Select
        value={timeRange}
        onValueChange={(v) => {
          setTimeRange(v);
          localStorage.setItem("lookup-date-selection", v);
          // Reset search results when filter changes
          if (lookupMutation.isSuccess) {
            lookupMutation.reset();
            setImageBase64("");
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select date range" />
        </SelectTrigger>
        <SelectContent>
          {recordDates.map((date) => (
            <SelectItem key={date} value={date}>
              {formatDateOption(date)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={handleSync}
        disabled={isSyncing}
        title="Sync records"
      >
        <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
      </Button>
      </div>

      {/* Upload Area */}
      <Card className={`border-2 ${imageBase64 ? "border-border" : "border-dashed border-primary/30 bg-primary/5"}`}>
        <CardContent className={imageBase64 ? "p-0" : "py-6"}>
          {imageBase64 ? (
            <div className="relative">
              <img
                src={imageBase64}
                alt="Query"
                className="w-full max-h-[30vh] object-contain bg-black/5 rounded-lg"
              />
              <button
                onClick={() => {
                  setImageBase64("");
                  lookupMutation.reset();
                }}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              className="flex flex-col items-center gap-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file?.type.startsWith("image/")) handleFile(file);
              }}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Search className="text-primary" size={20} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground text-sm">Upload photo to narrow results</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Or browse all records below
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={16} className="mr-1.5" />
                  Camera
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} className="mr-1.5" />
                  Upload
                </Button>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search in progress */}
      {lookupMutation.isPending && (
        <div className="text-center py-8">
          <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Comparing against records… This may take a moment.
          </p>
        </div>
      )}

      {/* No photo-search matches */}
      {lookupMutation.isSuccess && matches.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Search size={32} className="text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="font-medium text-foreground">No matches found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try expanding the date range or uploading a clearer photo
            </p>
          </CardContent>
        </Card>
      )}

      {/* Photo-search results */}
      {showSearchResults && matches.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {matches.length} result{matches.length !== 1 ? "s" : ""} found
          </p>
          {matches.map((match: any, idx: number) => {
            const rec = match.record;
            const conf = confidenceConfig[match.confidence as keyof typeof confidenceConfig];
            return (
              <Card
                key={rec.id || idx}
                className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                onClick={() => setSelectedRecord(rec)}
              >
                {rec.imageUrl && (
                  <img
                    src={rec.imageUrl}
                    alt={rec.dogId}
                    className="w-full aspect-[4/3] object-cover"
                  />
                )}
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-sm text-foreground">
                      {rec.dogId}
                    </span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${conf.className}`}>
                      {conf.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Clock size={12} />
                    <span>
                      {new Date(rec.recordedAt).toLocaleDateString("en-GB", {
                        timeZone: "Asia/Kolkata",
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {rec.areaName && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin size={12} />
                      <span>{rec.areaName}</span>
                    </div>
                  )}
                  {match.reason && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {match.reason}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Default list: all records in the selected range (shown when no photo search active) */}
      {!showSearchResults && (
        <div className="space-y-2">
          {defaultListQuery.isLoading ? (
            <div className="text-center py-6">
              <Loader2 size={24} className="animate-spin text-primary mx-auto" />
            </div>
          ) : defaultRecords.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Search size={32} className="text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="font-medium text-foreground">No unreleased dogs in this period</p>
                <p className="text-sm text-muted-foreground mt-1">Try selecting a different date range</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-sm font-medium text-muted-foreground">
                {defaultRecords.length} record{defaultRecords.length !== 1 ? "s" : ""} in this period
              </p>
              {defaultRecords.map((rec: any) => (
                <Card
                  key={rec.id}
                  className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                  onClick={() => setSelectedRecord(rec)}
                >
                  {rec.imageUrl && (
                    <img
                      src={rec.imageUrl}
                      alt={rec.dogId}
                      className="w-full aspect-[4/3] object-cover"
                    />
                  )}
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono font-bold text-sm text-foreground">
                        {rec.dogId}
                      </span>
                      {rec.releasedAt && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-300/50">
                          <CheckCircle2 size={9} />
                          Released
                        </span>
                      )}
                      {rec.inReleasePlan && !rec.releasedAt && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 border border-yellow-300/50">
                          Checked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Clock size={12} />
                      <span>
                        {new Date(rec.recordedAt).toLocaleDateString("en-GB", {
                          timeZone: "Asia/Kolkata",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {rec.areaName && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin size={12} />
                        <span>{rec.areaName}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <RecordDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onDelete={() => {
            setSelectedRecord(null);
            lookupMutation.reset();
          }}
        />
      )}
    </div>
  );
}
