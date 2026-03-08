import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
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
  const { teamId, webhookUrl } = useTeam();
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
          extractMetadata: source === "upload", // only extract burnt-in metadata for uploads
        });

        setDescription(result.description);

        if (source === "upload") {
          // Populate fields from burnt-in metadata if found
          if (result.latitude !== null && result.longitude !== null) {
            setLatitude(result.latitude);
            setLongitude(result.longitude);
            // If we got coords, also geocode for a clean place name (unless already set)
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
        const base64 = await fileToBase64(file);
        setImageBase64(base64);
        setImageSource("upload");
        setDescription("");
        setAnalysisError("");
        // Reset metadata fields so AI can fill them
        setLatitude(null);
        setLongitude(null);
        setAreaName("");
        setAreaNameEdited(false);
        setRecordedAt(toLocalDatetimeValue(new Date()));
        // Auto-run AI analysis with metadata extraction
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
        const base64 = await fileToBase64(file);
        setImageBase64(base64);
        setImageSource("camera");
        setDescription("");
        setAnalysisError("");
        // Set current device time
        setRecordedAt(toLocalDatetimeValue(new Date()));
        // Get device GPS
        requestDeviceGps();
        // Auto-run AI analysis (description only, no metadata extraction)
        runAnalysis(base64, "camera");
      } catch {
        toast.error("Failed to read image");
      }
    },
    [runAnalysis, requestDeviceGps]
  );

  // Save record — annotates only for camera captures, uploads save as-is
  const handleSave = async () => {
    if (!imageBase64 || !dogId) {
      toast.error("Please upload an image and set a Dog ID");
      return;
    }
    if (dogIdCheck.data?.exists) {
      toast.error("This Dog ID is already taken");
      return;
    }

    try {
      // Step 1: Annotate only for camera captures (this is the only awaited step)
      let finalImageBase64 = imageBase64;
      if (imageSource === "camera") {
        try {
          const annotated = await annotateMutation.mutateAsync({
            imageBase64,
            dogId,
            recordedAt: new Date(recordedAt).toISOString(),
            areaName: areaName || undefined,
            latitude: latitude ?? undefined,
            longitude: longitude ?? undefined,
            notes: notes || undefined,
          });
          finalImageBase64 = annotated.annotatedBase64;
        } catch (err) {
          console.warn("Annotation failed, saving original:", err);
        }
      }

      // Step 2: Fire save in background — don't await it
      saveMutation.mutate({
        teamIdentifier: teamId,
        dogId,
        imageBase64: finalImageBase64,
        originalImageBase64: imageBase64 !== finalImageBase64 ? imageBase64 : undefined,
        description: description || undefined,
        notes: notes || undefined,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        areaName: areaName || undefined,
        source: imageSource,
        recordedAt: new Date(recordedAt).getTime(),
        webhookUrl: webhookUrl || undefined,
      });

      // Confirm immediately and reset form
      toast.success(`Record ${dogId} saved!`);
      setImageBase64("");
      setDescription("");
      setNotes("");
      setAreaName("");
      setAreaNameEdited(false);
      setLatitude(null);
      setLongitude(null);
      setDogId("");
      setRecordedAt(toLocalDatetimeValue(new Date()));
      setAnalysisError("");
      utils.dogs.getNextSuffix.invalidate();
      // Delay records invalidation slightly to give background save time to complete
      setTimeout(() => utils.dogs.getRecords.invalidate(), 5000);
    } catch (err: any) {
      toast.error("Save failed: " + err.message);
    }
  };

  const handleReset = () => {
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
  };

  // Only block UI during annotation (camera only); save is fire-and-forget
  const isSaving = imageSource === "camera" && annotateMutation.isPending;
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
                {/* Camera button — opens actual camera on mobile */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={16} className="mr-1.5" />
                  Camera
                </Button>
                {/* Upload button — opens file picker */}
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

              {/* Camera input — capture="environment" forces rear camera on mobile */}
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
              {/* Gallery/upload input — no capture attribute */}
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
              {/* AI analysis status overlay */}
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

          {/* AI analysis error (non-fatal) */}
          {analysisError && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{analysisError}</span>
            </div>
          )}

          {/* AI Description */}
          {description && (
            <Card className="bg-accent/50 border-primary/20">
              <CardContent className="py-3">
                <div className="flex items-start gap-2">
                  <Sparkles size={16} className="text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-primary mb-1">AI Description</p>
                    <p className="text-sm text-foreground leading-relaxed">{description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Form */}
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

          {/* Save Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleSave}
            disabled={isSaving || analysisLoading || !dogId || dogIdCheck.data?.exists}
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                {annotateMutation.isPending ? "Annotating…" : "Saving…"}
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
