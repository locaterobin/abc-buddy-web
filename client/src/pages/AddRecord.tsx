import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { resizeImage } from "@/lib/resizeImage";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Camera,
  Upload,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { enqueueRecord, removeFromQueue, updateQueueStatus, getPendingRecords, type PendingRecord, QUEUE_CHANNEL_NAME } from "@/hooks/useOfflineQueue";
import PendingQueueBar from "@/components/PendingQueueBar";
import { logEvent } from "@/lib/appLog";
import { annotateAndShare } from "@/lib/annotateAndShare";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatAge(ts: number): string {
  const ms = Date.now() - ts;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CATCH_PLANS = [
  { label: "Alpha", letter: "A" },
  { label: "Beta",  letter: "B" },
  { label: "Charlie", letter: "C" },
  { label: "Delta", letter: "D" },
  { label: "Echo",  letter: "E" },
] as const;

const PLAN_STORAGE_KEY = "abc-buddy-catch-plan";
const LOCAL_SUFFIX_KEY_PREFIX = "abc-buddy-suffix-"; // key: prefix+plan e.g. "20260403A"

function getLocalSuffix(datePrefix: string, planLetter: string): string {
  const key = LOCAL_SUFFIX_KEY_PREFIX + datePrefix + planLetter;
  const stored = localStorage.getItem(key);
  const next = stored ? parseInt(stored, 10) + 1 : 1;
  return String(next).padStart(3, "0");
}

function saveLocalSuffix(datePrefix: string, planLetter: string, suffix: string): void {
  const key = LOCAL_SUFFIX_KEY_PREFIX + datePrefix + planLetter;
  localStorage.setItem(key, String(parseInt(suffix, 10)));
}

function generateQueueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDatePrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function toLocalDatetimeValue(date: Date): string {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type ImageSource = "upload" | "camera";

export default function AddRecord() {
  const { teamId, webhookUrl, staffSession } = useTeam();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Catch plan — persisted to localStorage
  const [catchPlan, setCatchPlan] = useState<string>(() => {
    return localStorage.getItem(PLAN_STORAGE_KEY) ?? "A";
  });
  // Track whether a plan change just happened so the useEffect always re-applies the suffix
  const planChangedRef = useRef(false);
  const handlePlanChange = (letter: string) => {
    setCatchPlan(letter);
    localStorage.setItem(PLAN_STORAGE_KEY, letter);
    planChangedRef.current = true;
    setDogId(""); // clear so useEffect can set the new ID
    utils.dogs.getNextSuffix.invalidate();
  };

  // Image state
  const [imageBase64, setImageBase64] = useState<string>("");
  const [imageSource, setImageSource] = useState<ImageSource>("upload");

  // Form state
  const datePrefix = useMemo(() => getDatePrefix(), []);
  const [dogId, setDogId] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toLocalDatetimeValue(new Date()));
  const [areaName, setAreaName] = useState("");
  const [areaNameEdited, setAreaNameEdited] = useState(false);
  const [district, setDistrict] = useState("");
  const [adminArea, setAdminArea] = useState("");
  const [notes, setNotes] = useState("");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Loading states
  const [gpsLoading, setGpsLoading] = useState(false);


  // Pending queue state (populated after mutations are declared below)
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([]);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const pendingCount = pendingRecords.length;

  // Queries & mutations
  const suffixQuery = trpc.dogs.getNextSuffix.useQuery(
    { teamIdentifier: teamId, datePrefix, planLetter: catchPlan },
    { enabled: !!teamId }
  );
  const dogIdCheck = trpc.dogs.checkDogId.useQuery(
    { teamIdentifier: teamId, dogId },
    { enabled: !!dogId && dogId.length > 4, staleTime: 0 }
  );

  const annotateMutation = trpc.dogs.annotateRecord.useMutation();
  const saveMutation = trpc.dogs.saveRecord.useMutation();
  const geocodeMutation = trpc.dogs.geocodeLatLng.useMutation();
  const webhookMutation = trpc.webhook.fire.useMutation();
  const utils = trpc.useUtils();

  // Queue helpers — declared after mutations so saveMutation/utils are in scope
  const refreshQueue = useCallback(async () => {
    if (!teamId) return;
    const recs = await getPendingRecords(teamId);
    setPendingRecords(recs);
  }, [teamId]);

  // Initial load + BroadcastChannel listener so queue updates live
  useEffect(() => {
    refreshQueue();
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(QUEUE_CHANNEL_NAME);
      ch.onmessage = () => refreshQueue();
    } catch { /* not supported */ }
    return () => { ch?.close(); };
  }, [refreshQueue]);

  // Retry a single queued record
  const retryRecord = useCallback(async (item: PendingRecord) => {
    setSyncingIds((prev) => new Set(prev).add(item.queueId));
    await updateQueueStatus(item.queueId, "syncing");
    try {
      await saveMutation.mutateAsync({
        teamIdentifier: item.teamIdentifier,
        dogId: item.dogId,
        imageBase64: item.imageBase64,
        description: item.description,
        notes: item.notes,
        latitude: item.latitude,
        longitude: item.longitude,
        areaName: item.areaName,
        district: item.district,
        adminArea: item.adminArea,
        source: item.source,
        recordedAt: item.recordedAt,
        webhookUrl: item.webhookUrl,
      });
      await removeFromQueue(item.queueId);
      logEvent("success", `Retry succeeded for ${item.dogId}`, item.dogId);
      toast.success(`${item.dogId} synced!`);
      utils.dogs.getRecords.invalidate();
    } catch (err: any) {
      await updateQueueStatus(item.queueId, "failed", err?.message ?? "Unknown error");
      logEvent("error", `Retry failed for ${item.dogId}: ${err?.message}`, item.dogId);
      toast.error(`${item.dogId} sync failed`);
    } finally {
      setSyncingIds((prev) => { const s = new Set(prev); s.delete(item.queueId); return s; });
      refreshQueue();
    }
  }, [saveMutation, utils, refreshQueue]);

  const syncAll = useCallback(async () => {
    const items = await getPendingRecords(teamId);
    for (const item of items) await retryRecord(item);
  }, [teamId, retryRecord]);

  const discardRecord = useCallback(async (queueId: string) => {
    await removeFromQueue(queueId);
    refreshQueue();
  }, [refreshQueue]);

  // Auto-retry 2 s after coming back online (grace period for network stack)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleOnline = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncAll(), 2000);
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      if (timer) clearTimeout(timer);
    };
  }, [syncAll]);

  // Auto-set dog ID when suffix loads or plan changes
  useEffect(() => {
    const needsId = !dogId || planChangedRef.current;
    if (suffixQuery.data?.suffix && needsId) {
      // Server responded — use authoritative suffix
      planChangedRef.current = false;
      const suffix = suffixQuery.data.suffix;
      saveLocalSuffix(datePrefix, catchPlan, suffix);
      setDogId(`${datePrefix}${catchPlan}-${suffix}`);
    } else if ((suffixQuery.isError || suffixQuery.fetchStatus === "paused") && needsId) {
      // Offline / network paused — use localStorage-based counter immediately
      planChangedRef.current = false;
      const suffix = getLocalSuffix(datePrefix, catchPlan);
      setDogId(`${datePrefix}${catchPlan}-${suffix}`);
    }
  }, [suffixQuery.data, suffixQuery.isError, suffixQuery.fetchStatus, datePrefix, catchPlan, dogId]);

  // Reverse geocode helper
  const geocode = useCallback(
    (lat: number, lng: number) => {
      geocodeMutation.mutate(
        { latitude: lat, longitude: lng },
        {
          onSuccess: (data) => {
            if (data.areaName && !areaNameEdited) {
              setAreaName(data.areaName);
            }
            if (data.district) setDistrict(data.district);
            if (data.adminArea) setAdminArea(data.adminArea);
          },
        }
      );
    },
    [areaNameEdited, geocodeMutation]
  );

  // Device GPS (for camera captures)
  const requestDeviceGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Set coords immediately — this works even with data off
        setLatitude(lat);
        setLongitude(lng);
        setGpsLoading(false);
        // Geocode is best-effort: fires only when online, silently skipped offline
        if (!areaNameEdited) geocode(lat, lng);
      },
      (err) => {
        console.warn("GPS error:", err);
        setGpsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 60000,
        // Accept a cached fix up to 2 minutes old — avoids waiting for fresh acquisition
        // when the device already has a recent fix from the OS
        maximumAge: 120000,
      }
    );
  }, [areaNameEdited, geocode]);



  // Handle file selected from gallery (upload)
  const handleUploadFile = useCallback(
    async (file: File) => {
      try {
        const rawBase64 = await fileToBase64(file);
        const base64 = await resizeImage(rawBase64, 1280, 0.82);
        setImageBase64(base64);
        setImageSource("upload");
        setDescription("");
        setLatitude(null);
        setLongitude(null);
        setAreaName("");
        setAreaNameEdited(false);
        setRecordedAt(toLocalDatetimeValue(new Date()));
        // No AI call — geocode only happens when GPS coords are set manually or via camera
      } catch {
        toast.error("Failed to read image");
      }
    },
    []
  );

  // Handle photo taken from camera
  const handleCameraFile = useCallback(
    async (file: File) => {
      try {
        const rawBase64 = await fileToBase64(file);
        const base64 = await resizeImage(rawBase64, 1280, 0.82);
        setImageBase64(base64);
        setImageSource("camera");
        setDescription("");
        setRecordedAt(toLocalDatetimeValue(new Date()));
        // Request GPS — geocode will fire automatically once coords arrive
        requestDeviceGps();
      } catch {
        toast.error("Failed to read image");
      }
    },
    [requestDeviceGps]
  );

  // Shared reset helper
  const resetForm = useCallback((lastSavedDogId?: string) => {
    setImageBase64("");
    setDescription("");
    setNotes("");
    setAreaName("");
    setAreaNameEdited(false);
    setDistrict("");
    setAdminArea("");
    setLatitude(null);
    setLongitude(null);
    setRecordedAt(toLocalDatetimeValue(new Date()));
    // Increment dog ID locally so the next ID is ready immediately without waiting
    // for a server refetch (the background save may not have completed yet)
    if (lastSavedDogId) {
      const parts = lastSavedDogId.split("-");
      const lastSerial = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSerial)) {
        const prefix = parts.slice(0, parts.length - 1).join("-");
        const nextSerial = lastSerial + 1;
        const nextSuffix = String(nextSerial).padStart(3, "0");
        // Keep local counter in sync so offline fallback is accurate
        saveLocalSuffix(datePrefix, catchPlan, String(lastSerial).padStart(3, "0"));
        setDogId(`${prefix}-${nextSuffix}`);
        return; // skip server invalidate — we already have the next ID
      }
    }
    setDogId("");
    utils.dogs.getNextSuffix.invalidate();
  }, [utils]);

  const handleReset = useCallback(() => {
    resetForm();
  }, [resetForm]);

  // Save record — enqueue locally first, then sync in background
  const handleSave = () => {
    if (!imageBase64 || !dogId) {
      toast.error("Please upload an image and set a Dog ID");
      return;
    }
    if (!areaName.trim()) {
      toast.error("Area / Location is required before saving");
      return;
    }
    if (dogIdCheck.data?.exists) {
      toast.error("This Dog ID is already taken");
      return;
    }

    // Log immediately — first thing before any async work, with full record data
    logEvent("info", JSON.stringify({
      event: "save_pressed",
      dogId,
      team: teamId,
      staff: staffSession?.name ?? null,
      area: areaName || null,
      lat: latitude ?? null,
      lng: longitude ?? null,
      notes: notes || null,
      source: imageSource,
      recordedAt: new Date(recordedAt).toISOString(),
    }), dogId);

    // Snapshot values before reset
    const savedDogId = dogId;
    const savedImageBase64 = imageBase64;
    const savedSource = imageSource;
    const savedDescription = description;
    const savedNotes = notes;
    const savedLat = latitude;
    const savedLng = longitude;
    const savedAreaName = areaName;
    const savedDistrict = district;
    const savedAdminArea = adminArea;
    const savedRecordedAt = new Date(recordedAt).getTime();
    const savedWebhookUrl = webhookUrl;
    const savedTeamId = teamId;
    const savedStaffId = staffSession?.staffId ?? undefined;
    const savedStaffName = staffSession?.name ?? undefined;
    const queueId = generateQueueId();

    // Fire add webhook immediately via server proxy (avoids CORS/mixed-content on mobile PWA)
    if (savedWebhookUrl) {
      webhookMutation.mutateAsync({
        url: savedWebhookUrl,
        payload: {
          event: "add",
          dogId: savedDogId,
          teamIdentifier: savedTeamId,
          recordedAt: new Date(savedRecordedAt).toISOString(),
          description: savedDescription || null,
          latitude: savedLat ?? null,
          longitude: savedLng ?? null,
          areaName: savedAreaName || null,
          adminArea: savedAdminArea || null,
          notes: savedNotes || null,
          source: savedSource,
          addedByStaffId: savedStaffId ?? null,
          addedByStaffName: savedStaffName ?? null,
        },
      }).catch((e: unknown) => console.warn("Add webhook proxy failed:", e));
    }

    // Reset form immediately — pass current dogId so next ID is incremented locally
    resetForm(savedDogId);
    setTimeout(() => utils.dogs.getRecords.invalidate(), 6000);

    // Parallel share flow — annotate client-side, inject EXIF, trigger share sheet.
    // Only for camera captures in the Catch flow (not uploads, not release/other photos).
    if (savedSource === "camera") annotateAndShare({
      imageBase64: savedImageBase64,
      dogId: savedDogId,
      latitude: savedLat,
      longitude: savedLng,
      areaName: savedAreaName || undefined,
      recordedAt: savedRecordedAt,
      notes: savedNotes || undefined,
    });

    // Run annotation + save in background, with offline queue tracking
    const runBackground = async () => {
      // Enqueue first — record is safe on device before any network call
      await enqueueRecord({
        queueId,
        teamIdentifier: savedTeamId,
        dogId: savedDogId,
        imageBase64: savedImageBase64,
        description: savedDescription || undefined,
        notes: savedNotes || undefined,
        latitude: savedLat ?? undefined,
        longitude: savedLng ?? undefined,
        areaName: savedAreaName || undefined,
        district: savedDistrict || undefined,
        adminArea: savedAdminArea || undefined,
        source: savedSource,
        recordedAt: savedRecordedAt,
        webhookUrl: savedWebhookUrl || undefined,
      });
      logEvent("info", `Queued for save`, savedDogId);

      // Show a dismissible pending toast
      const toastId = toast.loading(`Saving ${savedDogId}…`, { duration: Infinity });

      // Client-side pre-annotation removed — saveRecord handles annotation server-side.
      const finalImageBase64 = savedImageBase64;

      try {
        logEvent("info", `Save attempt started`, savedDogId);
        const result = await saveMutation.mutateAsync({
          teamIdentifier: savedTeamId,
          dogId: savedDogId,
          imageBase64: finalImageBase64,
          description: savedDescription || undefined,
          notes: savedNotes || undefined,
          latitude: savedLat ?? undefined,
          longitude: savedLng ?? undefined,
          areaName: savedAreaName || undefined,
          district: savedDistrict || undefined,
          adminArea: savedAdminArea || undefined,
          source: savedSource,
          recordedAt: savedRecordedAt,
          webhookUrl: savedWebhookUrl || undefined,
          addedByStaffId: savedStaffId,
          addedByStaffName: savedStaffName,
        });

        // Server confirmed DB insert — safe to remove from queue
        await removeFromQueue(queueId);
        logEvent("success", `Saved & confirmed by server (resolvedId: ${result?.dogId ?? savedDogId})`, savedDogId);
        toast.dismiss(toastId);
        toast.success(`${savedDogId} saved!`);
        refreshQueue(); // remove from queue card immediately
      } catch (err: any) {
        // Mark as failed in queue — stays visible in queue card for retry
        await updateQueueStatus(queueId, "failed", err?.message ?? "Unknown error");
        logEvent("error", `Save failed: ${err?.message ?? "Unknown error"}`, savedDogId);
        toast.dismiss(toastId);
        toast.error(`${savedDogId} failed — tap Retry in the queue above`, {
          duration: 10000,
        });
        refreshQueue(); // show failure in queue card immediately
      }
    };

    runBackground();
  };
  const hasImage = !!imageBase64;

  return (
    <div className="container py-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Catching Team — always visible at top */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Catching Team
        </label>
        <Select value={catchPlan} onValueChange={handlePlanChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select plan" />
          </SelectTrigger>
          <SelectContent>
            {CATCH_PLANS.map((p) => (
              <SelectItem key={p.letter} value={p.letter}>
                {p.label} ({p.letter})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Upload Area */}
      {!hasImage ? (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardContent className="py-10">
            <div
              className="flex flex-col items-center gap-4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file?.type.startsWith("image/")) handleUploadFile(file);
              }}
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="text-primary" size={28} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Add a Dog</p>

              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-card"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={16} className="mr-1.5" />
                  Upload
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={16} className="mr-1.5" />
                  Camera
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
                  if (file) handleCameraFile(file);
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
                  if (file) handleUploadFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Image Preview */}
          <Card className="overflow-hidden">
            <div className="relative">
              <img
                src={imageBase64}
                alt="Dog preview"
                className="w-full max-h-[45vh] object-contain bg-black/5"
              />
              <button
                onClick={handleReset}
                className="absolute top-2 left-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition-colors"
              >
                <RotateCcw size={16} />
              </button>

            </div>
          </Card>



          <Card>
            <CardContent className="py-4 space-y-4">
              {/* Dog ID */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Dog ID
                </label>
                <div className="relative">
                  <Input
                    value={dogId}
                    onChange={(e) => setDogId(e.target.value)}
                    placeholder="YYYYMMDDP-NNN"
                    className="font-mono pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {dogIdCheck.isLoading ? (
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    ) : dogIdCheck.data?.exists ? (
                      <XCircle size={16} className="text-destructive" />
                    ) : dogId.length > 4 ? (
                      <CheckCircle2 size={16} className="text-primary" />
                    ) : null}
                  </div>
                </div>
                {dogIdCheck.data?.exists && (
                  <p className="text-xs text-destructive mt-1">This Dog ID is already taken</p>
                )}
              </div>

              {/* Date/Time */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Date & Time
                  {imageSource === "camera" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (device time)
                    </span>
                  )}
                </label>
                <Input
                  type="datetime-local"
                  value={recordedAt}
                  onChange={(e) => setRecordedAt(e.target.value)}
                  readOnly={imageSource === "camera"}
                  className={imageSource === "camera" ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}
                />
              </div>

              {/* Area Name */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Area / Location
                </label>
                <div className="relative">
                  <Input
                    value={areaName}
                    onChange={(e) => {
                      setAreaName(e.target.value);
                      setAreaNameEdited(true);
                    }}
                    placeholder={
                      gpsLoading || geocodeMutation.isPending
                        ? "Getting location…"
                        : "Area name"
                    }
                    className="pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {gpsLoading || geocodeMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    ) : latitude ? (
                      <MapPin size={16} className="text-primary" />
                    ) : null}
                  </div>
                </div>
                {latitude !== null && longitude !== null ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    GPS: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </p>
                ) : !gpsLoading && !geocodeMutation.isPending ? (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <MapPin size={11} className="text-muted-foreground/60" />
                    GPS not available
                  </p>
                ) : null}
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Notes{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any observations about the dog…"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={!dogId || dogIdCheck.data?.exists === true || !areaName.trim()}
          >
            <Save size={16} className="mr-2" />
            Save Record
          </Button>
        </>
      )}
      <PendingQueueBar
        records={pendingRecords}
        syncingIds={syncingIds}
        onRetry={retryRecord}
        onDiscard={discardRecord}
        onSyncAll={syncAll}
      />
    </div>
  );
}
