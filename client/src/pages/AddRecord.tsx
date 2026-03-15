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
  Sparkles,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { enqueueRecord, removeFromQueue, updateQueueStatus } from "@/hooks/useOfflineQueue";

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

  // Image state
  const [imageBase64, setImageBase64] = useState<string>("");
  const [imageSource, setImageSource] = useState<ImageSource>("upload");

  // Form state
  const datePrefix = useMemo(() => getDatePrefix(), []);
  const [dogId, setDogId] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => toLocalDatetimeValue(new Date()));
  const [areaName, setAreaName] = useState("");
  const [areaNameEdited, setAreaNameEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Loading states
  const [gpsLoading, setGpsLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Queries & mutations
  const suffixQuery = trpc.dogs.getNextSuffix.useQuery(
    { teamIdentifier: teamId, datePrefix },
    { enabled: !!teamId }
  );
  const dogIdCheck = trpc.dogs.checkDogId.useQuery(
    { teamIdentifier: teamId, dogId },
    { enabled: !!dogId && dogId.length > 4 }
  );
  const analyzeMutation = trpc.dogs.analyzeImage.useMutation();
  const annotateMutation = trpc.dogs.annotateRecord.useMutation();
  const saveMutation = trpc.dogs.saveRecord.useMutation();
  const geocodeMutation = trpc.dogs.geocodeLatLng.useMutation();
  const utils = trpc.useUtils();

  // Auto-set dog ID when suffix loads
  useEffect(() => {
    if (suffixQuery.data?.suffix && !dogId) {
      setDogId(`${datePrefix}-${suffixQuery.data.suffix}`);
    }
  }, [suffixQuery.data, datePrefix, dogId]);

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
        setLatitude(lat);
        setLongitude(lng);
        setGpsLoading(false);
        if (!areaNameEdited) geocode(lat, lng);
      },
      (err) => {
        console.warn("GPS error:", err);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [areaNameEdited, geocode]);

  // Run AI analysis (auto-triggered after image is set)
  const runAnalysis = useCallback(
    async (base64: string, source: ImageSource) => {
      setAnalysisLoading(true);
      setAnalysisError("");
      try {
        const result = await analyzeMutation.mutateAsync({
          imageBase64: base64,
          extractMetadata: source === "upload",
        });

        setDescription(result.description);

        if (source === "upload") {
          if (result.latitude !== null && result.longitude !== null) {
            setLatitude(result.latitude);
            setLongitude(result.longitude);
            if (!areaNameEdited) {
              geocode(result.latitude, result.longitude);
            }
          }
          if (result.recordedAt) {
            try {
              const d = new Date(result.recordedAt);
              if (!isNaN(d.getTime())) {
                setRecordedAt(toLocalDatetimeValue(d));
              }
            } catch {}
          }
          if (result.areaName && !areaNameEdited) {
            setAreaName(result.areaName);
          }
          if (result.notes) {
            setNotes((prev) => (prev ? prev : result.notes || ""));
          }
        }
      } catch (err: any) {
        setAnalysisError("AI analysis failed. You can still save the record.");
        console.error("Analysis error:", err);
      } finally {
        setAnalysisLoading(false);
      }
    },
    [analyzeMutation, areaNameEdited, geocode]
  );

  // Handle file selected from gallery (upload)
  const handleUploadFile = useCallback(
    async (file: File) => {
      try {
        const rawBase64 = await fileToBase64(file);
        const base64 = await resizeImage(rawBase64, 1280, 0.82);
        setImageBase64(base64);
        setImageSource("upload");
        setDescription("");
        setAnalysisError("");
        setLatitude(null);
        setLongitude(null);
        setAreaName("");
        setAreaNameEdited(false);
        setRecordedAt(toLocalDatetimeValue(new Date()));
        runAnalysis(base64, "upload");
      } catch {
        toast.error("Failed to read image");
      }
    },
    [runAnalysis]
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
        setAnalysisError("");
        setRecordedAt(toLocalDatetimeValue(new Date()));
        requestDeviceGps();
        runAnalysis(base64, "camera");
      } catch {
        toast.error("Failed to read image");
      }
    },
    [runAnalysis, requestDeviceGps]
  );

  // Shared reset helper
  const resetForm = useCallback(() => {
    setImageBase64("");
    setDescription("");
    setNotes("");
    setDogId("");
    setAreaName("");
    setAreaNameEdited(false);
    setLatitude(null);
    setLongitude(null);
    setRecordedAt(toLocalDatetimeValue(new Date()));
    setAnalysisError("");
    utils.dogs.getNextSuffix.invalidate();
  }, [utils]);

  const handleReset = useCallback(() => {
    resetForm();
  }, [resetForm]);

  const [isSaving, setIsSaving] = useState(false);

  // Save record — enqueue locally first, then sync in background
  const handleSave = () => {
    if (!imageBase64 || !dogId) {
      toast.error("Please upload an image and set a Dog ID");
      return;
    }
    if (dogIdCheck.data?.exists) {
      toast.error("This Dog ID is already taken");
      return;
    }

    // Snapshot values before reset
    const savedDogId = dogId;
    const savedImageBase64 = imageBase64;
    const savedSource = imageSource;
    const savedDescription = description;
    const savedNotes = notes;
    const savedLat = latitude;
    const savedLng = longitude;
    const savedAreaName = areaName;
    const savedRecordedAt = new Date(recordedAt).getTime();
    const savedWebhookUrl = webhookUrl;
    const savedTeamId = teamId;
    const savedStaffId = staffSession?.staffId ?? undefined;
    const savedStaffName = staffSession?.name ?? undefined;
    const queueId = generateQueueId();

    // Fire add webhook immediately (client-side, for redundancy)
    if (savedWebhookUrl) {
      fetch(savedWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "add",
          dogId: savedDogId,
          teamIdentifier: savedTeamId,
          recordedAt: new Date(savedRecordedAt).toISOString(),
          latitude: savedLat ?? null,
          longitude: savedLng ?? null,
          areaName: savedAreaName || null,
          notes: savedNotes || null,
          source: savedSource,
          addedByStaffId: savedStaffId ?? null,
          addedByStaffName: savedStaffName ?? null,
        }),
      }).catch((e) => console.warn("Add webhook failed:", e));
    }

    // Reset form immediately
    resetForm();
    setTimeout(() => utils.dogs.getRecords.invalidate(), 6000);

    // Run annotation + save in background, with offline queue tracking
    const runBackground = async () => {
      // Enqueue first so it's visible in Lookup immediately
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
        source: savedSource,
        recordedAt: savedRecordedAt,
        webhookUrl: savedWebhookUrl || undefined,
      });

      // Show a dismissible pending toast
      const toastId = toast.loading(`Saving ${savedDogId}…`, { duration: Infinity });

      // Annotate camera photos before saving
      let finalImageBase64 = savedImageBase64;
      if (savedSource === "camera") {
        try {
          const annotated = await annotateMutation.mutateAsync({
            imageBase64: savedImageBase64,
            dogId: savedDogId,
            recordedAt: new Date(savedRecordedAt).toISOString(),
            areaName: savedAreaName || undefined,
            latitude: savedLat ?? undefined,
            longitude: savedLng ?? undefined,
            notes: savedNotes || undefined,
          });
          finalImageBase64 = annotated.annotatedBase64;
        } catch (e) {
          console.warn("Annotation failed, saving without annotation:", e);
        }
      }

      try {
        await saveMutation.mutateAsync({
          teamIdentifier: savedTeamId,
          dogId: savedDogId,
          imageBase64: finalImageBase64,
          description: savedDescription || undefined,
          notes: savedNotes || undefined,
          latitude: savedLat ?? undefined,
          longitude: savedLng ?? undefined,
          areaName: savedAreaName || undefined,
          source: savedSource,
          recordedAt: savedRecordedAt,
          webhookUrl: savedWebhookUrl || undefined,
          addedByStaffId: savedStaffId,
          addedByStaffName: savedStaffName,
        });

        // Success — remove from queue
        await removeFromQueue(queueId);
        toast.dismiss(toastId);
        toast.success(`${savedDogId} saved!`);
      } catch (err: any) {
        // Mark as failed in queue — will appear in Lookup for retry
        await updateQueueStatus(queueId, "failed", err?.message ?? "Unknown error");
        toast.dismiss(toastId);
        toast.error(`${savedDogId} failed to save — check Lookup to retry`, {
          duration: 10000,
        });
      }
    };

    setIsSaving(true);
    runBackground().finally(() => setIsSaving(false));
  };
  const hasImage = !!imageBase64;

  return (
    <div className="container py-4 pb-6 max-w-lg mx-auto space-y-4">
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
                <p className="font-semibold text-foreground">Add a dog photo</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Take a photo or upload from gallery
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
                  className="bg-card"
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
              {analysisLoading && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                  <Loader2 size={28} className="animate-spin text-white" />
                  <span className="text-white text-sm font-medium">
                    {imageSource === "upload" ? "Reading image & extracting data…" : "Analysing dog…"}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {analysisError && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{analysisError}</span>
            </div>
          )}

          {hasImage && (
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                <Sparkles size={14} className="text-primary" />
                AI Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="text-sm resize-none"
                placeholder="AI-generated description..."
              />
            </div>
          )}

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
                    placeholder="YYYYMMDD-NNN"
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
                  {imageSource === "upload" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (from image)
                    </span>
                  )}
                </label>
                <Input
                  type="datetime-local"
                  value={recordedAt}
                  onChange={(e) => setRecordedAt(e.target.value)}
                />
              </div>

              {/* Area Name */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Area / Location
                  {imageSource === "upload" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (from image)
                    </span>
                  )}
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
                {latitude !== null && longitude !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    GPS: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Notes{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                  {imageSource === "upload" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      (from image)
                    </span>
                  )}
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
            disabled={isSaving || !dogId || dogIdCheck.data?.exists || (imageSource === "camera" && (latitude === null || longitude === null))}
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                {"Saving…"}
              </>
            ) : (
              <>
                <Save size={16} className="mr-2" />
                Save Record
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
