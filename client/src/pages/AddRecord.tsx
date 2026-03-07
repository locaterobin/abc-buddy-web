import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Camera,
  Upload,
  Sparkles,
  Stamp,
  Save,
  CheckCircle2,
  XCircle,
  Loader2,
  MapPin,
  RotateCcw,
} from "lucide-react";

function getDatePrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AddRecord() {
  const { teamId, webhookUrl } = useTeam();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Image state
  const [imageBase64, setImageBase64] = useState<string>("");
  const [originalImageBase64, setOriginalImageBase64] = useState<string>("");
  const [isAnnotated, setIsAnnotated] = useState(false);

  // Form state
  const datePrefix = useMemo(() => getDatePrefix(), []);
  const [dogId, setDogId] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [areaName, setAreaName] = useState("");
  const [areaNameEdited, setAreaNameEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [description, setDescription] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Queries
  const suffixQuery = trpc.dogs.getNextSuffix.useQuery(
    { teamIdentifier: teamId, datePrefix },
    { enabled: !!teamId }
  );

  const dogIdCheck = trpc.dogs.checkDogId.useQuery(
    { teamIdentifier: teamId, dogId },
    { enabled: !!dogId && dogId.length > 4 }
  );

  // Mutations
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

  // Request GPS
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setGpsLoading(false);
        // Auto-geocode
        if (!areaNameEdited) {
          geocodeMutation.mutate(
            { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
            {
              onSuccess: (data) => {
                if (data.areaName && !areaNameEdited) {
                  setAreaName(data.areaName);
                }
              },
            }
          );
        }
      },
      (err) => {
        console.warn("GPS error:", err);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [areaNameEdited, geocodeMutation]);

  // Handle file selection
  const handleFile = useCallback(
    async (file: File) => {
      try {
        const base64 = await fileToBase64(file);
        setImageBase64(base64);
        setOriginalImageBase64(base64);
        setIsAnnotated(false);
        setDescription("");
        // Request GPS on upload
        requestGps();
      } catch (e) {
        toast.error("Failed to read image");
      }
    },
    [requestGps]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  // Analyze with AI
  const handleAnalyze = () => {
    const img = originalImageBase64 || imageBase64;
    if (!img) return;
    analyzeMutation.mutate(
      { imageBase64: img },
      {
        onSuccess: (data) => {
          setDescription(data.description);
          toast.success("AI analysis complete");
        },
        onError: (err) => {
          toast.error("AI analysis failed: " + err.message);
        },
      }
    );
  };

  // Annotate image
  const handleAnnotate = () => {
    const img = originalImageBase64 || imageBase64;
    if (!img) return;
    annotateMutation.mutate(
      {
        imageBase64: img,
        dogId,
        recordedAt: new Date(recordedAt).toISOString(),
        areaName: areaName || undefined,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        notes: notes || undefined,
      },
      {
        onSuccess: (data) => {
          setImageBase64(data.annotatedBase64);
          setIsAnnotated(true);
          toast.success("Image annotated");
        },
        onError: (err) => {
          toast.error("Annotation failed: " + err.message);
        },
      }
    );
  };

  // Save record
  const handleSave = () => {
    if (!imageBase64 || !dogId) {
      toast.error("Please upload an image and set a Dog ID");
      return;
    }

    saveMutation.mutate(
      {
        teamIdentifier: teamId,
        dogId,
        imageBase64,
        originalImageBase64: originalImageBase64 || undefined,
        description: description || undefined,
        notes: notes || undefined,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        areaName: areaName || undefined,
        source: "upload",
        recordedAt: new Date(recordedAt).getTime(),
        webhookUrl: webhookUrl || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Record saved successfully!");
          // Reset form
          setImageBase64("");
          setOriginalImageBase64("");
          setIsAnnotated(false);
          setDescription("");
          setNotes("");
          setAreaName("");
          setAreaNameEdited(false);
          setDogId("");
          // Refresh suffix
          utils.dogs.getNextSuffix.invalidate();
          utils.dogs.getRecords.invalidate();
        },
        onError: (err) => {
          toast.error("Save failed: " + err.message);
        },
      }
    );
  };

  // Reset form
  const handleReset = () => {
    setImageBase64("");
    setOriginalImageBase64("");
    setIsAnnotated(false);
    setDescription("");
    setNotes("");
    setDogId("");
    setAreaName("");
    setAreaNameEdited(false);
    utils.dogs.getNextSuffix.invalidate();
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
              onDrop={handleDrop}
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
                className="w-full max-h-[50vh] object-contain bg-black/5"
              />
              {isAnnotated && (
                <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground">
                  Annotated
                </Badge>
              )}
              <button
                onClick={handleReset}
                className="absolute top-2 left-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition-colors"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </Card>

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
                </label>
                <div className="relative">
                  <Input
                    value={areaName}
                    onChange={(e) => {
                      setAreaName(e.target.value);
                      setAreaNameEdited(true);
                    }}
                    placeholder={geocodeMutation.isPending ? "Getting location..." : "Area name"}
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
                {latitude && longitude && (
                  <p className="text-xs text-muted-foreground mt-1">
                    GPS: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any observations about the dog..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

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

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <Button
              variant="outline"
              className="w-full bg-card"
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Sparkles size={16} className="mr-2" />
              )}
              {analyzeMutation.isPending ? "Analysing..." : "Analyse with AI"}
            </Button>

            <Button
              variant="outline"
              className="w-full bg-card"
              onClick={handleAnnotate}
              disabled={annotateMutation.isPending || !dogId}
            >
              {annotateMutation.isPending ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Stamp size={16} className="mr-2" />
              )}
              {annotateMutation.isPending ? "Annotating..." : "Annotate Image"}
            </Button>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSave}
              disabled={saveMutation.isPending || !dogId || dogIdCheck.data?.exists}
            >
              {saveMutation.isPending ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Save size={16} className="mr-2" />
              )}
              {saveMutation.isPending ? "Saving..." : "Save Record"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
