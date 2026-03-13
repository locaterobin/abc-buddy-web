import { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";
import RecordDetailModal from "@/components/RecordDetailModal";
import { getCachedRecordDates, setCachedRecordDates } from "@/hooks/useRecordCache";

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

/** Convert timeRange value to dateFrom / dateTo for getRecordsPaginated */
function timeRangeToDateFilter(timeRange: string): { dateFrom?: string; dateTo?: string } {
  if (timeRange === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    return { dateFrom: iso, dateTo: iso };
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
  const { teamId } = useTeam();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [timeRange, setTimeRange] = useState<string>("7days");
  const [imageBase64, setImageBase64] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const lookupMutation = trpc.dogs.lookupDog.useMutation();

  // Cached dates for offline support
  const [cachedDates, setCachedDates] = useState<string[]>([]);
  useEffect(() => {
    if (teamId) getCachedRecordDates(teamId).then(setCachedDates);
  }, [teamId]);

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
  const defaultRecords: any[] = defaultListQuery.data?.records ?? [];

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
      {/* Date Range Dropdown */}
      <Select
        value={timeRange}
        onValueChange={(v) => {
          setTimeRange(v);
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
          <SelectItem value="yesterday">Yesterday</SelectItem>
          <SelectItem value="7days">Last 7 days</SelectItem>
          <SelectItem value="30days">Last 30 days</SelectItem>
          {recordDates.length > 0 && (
            <>
              {recordDates.map((date) => (
                <SelectItem key={date} value={date}>
                  {formatDateOption(date)}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

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
                    </div>
                  </div>
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
                <p className="font-medium text-foreground">No records in this period</p>
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
                      </div>
                    </div>
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
