import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search,
  Upload,
  Camera,
  Loader2,
  Clock,
  MapPin,
  X,
} from "lucide-react";
import RecordDetailModal from "@/components/RecordDetailModal";

type TimeRange = "3days" | "7days" | "30days";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Lookup() {
  const { teamId } = useTeam();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [timeRange, setTimeRange] = useState<TimeRange>("3days");
  const [imageBase64, setImageBase64] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const lookupMutation = trpc.dogs.lookupDog.useMutation();

  const handleFile = useCallback(async (file: File) => {
    try {
      const base64 = await fileToBase64(file);
      setImageBase64(base64);
    } catch {
      toast.error("Failed to read image");
    }
  }, []);

  const handleSearch = () => {
    if (!imageBase64) {
      toast.error("Please upload an image first");
      return;
    }
    lookupMutation.mutate(
      { teamIdentifier: teamId, imageBase64, timeRange },
      {
        onError: (err) => {
          toast.error("Search failed: " + err.message);
        },
      }
    );
  };

  const confidenceConfig = {
    high: { label: "High match", className: "bg-green-100 text-green-800 border-green-200" },
    medium: { label: "Possible match", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    low: { label: "Low match", className: "bg-gray-100 text-gray-600 border-gray-200" },
  };

  const matches = lookupMutation.data?.matches || [];

  return (
    <div className="container py-4 pb-6 max-w-lg mx-auto space-y-4">
      {/* Time Range Selector */}
      <div className="flex gap-2">
        {(["3days", "7days", "30days"] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              timeRange === range
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {range === "3days" ? "3 Days" : range === "7days" ? "7 Days" : "30 Days"}
          </button>
        ))}
      </div>

      {/* Upload Area */}
      <Card className={`border-2 ${imageBase64 ? "border-border" : "border-dashed border-primary/30 bg-primary/5"}`}>
        <CardContent className={imageBase64 ? "p-0" : "py-8"}>
          {imageBase64 ? (
            <div className="relative">
              <img
                src={imageBase64}
                alt="Query"
                className="w-full max-h-[35vh] object-contain bg-black/5 rounded-lg"
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
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Search className="text-primary" size={24} />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Upload a photo to search</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Find matching dogs in your records
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
              {/* Camera input — opens rear camera directly */}
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
              {/* Upload input — opens gallery/file picker */}
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

      {/* Search Button */}
      {imageBase64 && (
        <Button
          className="w-full"
          size="lg"
          onClick={handleSearch}
          disabled={lookupMutation.isPending}
        >
          {lookupMutation.isPending ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <Search size={16} className="mr-2" />
          )}
          {lookupMutation.isPending ? "Searching..." : "Search Records"}
        </Button>
      )}

      {/* Results */}
      {lookupMutation.isPending && (
        <div className="text-center py-8">
          <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Comparing against records... This may take a moment.
          </p>
        </div>
      )}

      {lookupMutation.isSuccess && matches.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Search size={32} className="text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="font-medium text-foreground">No matches found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try expanding the time range or uploading a clearer photo
            </p>
          </CardContent>
        </Card>
      )}

      {matches.length > 0 && (
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
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedRecord(rec)}
              >
                <CardContent className="p-3">
                  <div className="flex gap-3">
                    {rec.imageUrl && (
                      <img
                        src={rec.imageUrl}
                        alt={rec.dogId}
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
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
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      {rec.areaName && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={12} />
                          <span className="truncate">{rec.areaName}</span>
                        </div>
                      )}
                      {match.reason && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                          {match.reason}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
