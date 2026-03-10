import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  X,
  MapPin,
  Clock,
  Sparkles,
  StickyNote,
  Trash2,
  Loader2,
  ExternalLink,
  CheckCircle2,
  CheckCircle,
  AlertTriangle,
  StopCircle,
} from "lucide-react";

interface RecordDetailModalProps {
  record: any;
  onClose: () => void;
  onDelete?: () => void;
}

/** Haversine formula — returns distance in metres */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceLabel(m: number): string {
  if (m < 1000) return `${Math.round(m)} METERS AWAY`;
  return `${(m / 1000).toFixed(1)} KM AWAY`;
}

function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

interface ReleaseConfirmData {
  latitude: number | null;
  longitude: number | null;
  areaName: string;
  distanceMetres: number | null;
}

export default function RecordDetailModal({ record, onClose, onDelete }: RecordDetailModalProps) {
  const { teamId, webhookUrl } = useTeam();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.dogs.deleteRecord.useMutation();
  const geocodeMutation = trpc.dogs.geocodeLatLng.useMutation();
  const saveReleaseMutation = trpc.dogs.saveRelease.useMutation();

  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(() => !!record.releasedAt);
  const [confirmData, setConfirmData] = useState<ReleaseConfirmData | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Push a history entry when modal opens so back button can close it
  useEffect(() => {
    history.pushState({ modal: true }, "");
    const handlePop = () => {
      onClose();
    };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to delete this record? This cannot be undone.")) return;
    deleteMutation.mutate(
      { id: record.id, teamIdentifier: teamId },
      {
        onSuccess: () => {
          toast.success("Record deleted");
          utils.dogs.getRecords.invalidate();
          if (webhookUrl) {
            const deleteUrl = webhookUrl.replace(/\/$/, "") + "/delete";
            fetch(deleteUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dogId: record.dogId }),
            }).catch((e) => console.error("Delete webhook failed:", e));
          }
          onDelete?.();
          onClose();
        },
        onError: (err) => toast.error("Delete failed: " + err.message),
      }
    );
  };

  const handleRelease = async () => {
    if (!webhookUrl) {
      toast.error("No webhook URL configured. Set it in Settings.");
      return;
    }

    setReleasing(true);
    let latitude: number | null = null;
    let longitude: number | null = null;
    let areaName = "";

    try {
      // 1. Get current GPS
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 10000,
            maximumAge: 30000,
            enableHighAccuracy: true,
          })
        );
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch {
        toast("GPS unavailable — sending without location", { icon: "⚠️" });
      }

      // 2. Reverse geocode
      if (latitude !== null && longitude !== null) {
        try {
          const geo = await geocodeMutation.mutateAsync({ latitude, longitude });
          areaName = geo.areaName || "";
        } catch {
          // continue without area name
        }
      }

      // 3. Calculate distance from capture
      let distanceMetres: number | null = null;
      if (
        latitude !== null &&
        longitude !== null &&
        record.latitude != null &&
        record.longitude != null
      ) {
        distanceMetres = haversineMetres(record.latitude, record.longitude, latitude, longitude);
      }

      // 4. Show custom confirm dialog
      setConfirmData({ latitude, longitude, areaName, distanceMetres });
    } catch (err: any) {
      toast.error("Release failed: " + (err?.message || "Unknown error"));
    } finally {
      setReleasing(false);
    }
  };

  const handleConfirmRelease = async () => {
    if (!confirmData) return;
    setConfirming(true);
    const { latitude, longitude, areaName, distanceMetres } = confirmData;

    try {
      const releasedAt = new Date().toISOString();
      const distanceRounded = distanceMetres !== null ? Math.round(distanceMetres) : null;

      // Save to DB first
      await saveReleaseMutation.mutateAsync({
        id: record.id,
        teamIdentifier: teamId,
        releasedAt,
        releaseLatitude: latitude,
        releaseLongitude: longitude,
        releaseAreaName: areaName || null,
        releaseDistanceMetres: distanceRounded,
      });

      // Fire webhook
      const releaseUrl = webhookUrl!.replace(/\/$/, "") + "/release";
      const payload = {
        dogId: record.dogId,
        teamIdentifier: teamId,
        releasedAt,
        captureLatitude: record.latitude ?? null,
        captureLongitude: record.longitude ?? null,
        captureAreaName: record.areaName ?? null,
        releaseLatitude: latitude,
        releaseLongitude: longitude,
        releaseAreaName: areaName || null,
        distanceFromCapture: distanceRounded,
      };

      const res = await fetch(releaseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Webhook responded with ${res.status}`);

      utils.dogs.getRecords.invalidate();
      setReleased(true);
      setConfirmData(null);
      const distanceMsg =
        distanceMetres !== null ? ` · ${formatDistance(distanceMetres)} from capture` : "";
      toast.success(`${record.dogId} marked as Released${distanceMsg}`);
    } catch (err: any) {
      toast.error("Release failed: " + (err?.message || "Unknown error"));
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelRelease = () => {
    setConfirmData(null);
  };

  const gpsLink =
    record.latitude && record.longitude
      ? `https://www.google.com/maps?q=${record.latitude},${record.longitude}`
      : null;

  const releaseGpsLink =
    record.releaseLatitude && record.releaseLongitude
      ? `https://www.google.com/maps?q=${record.releaseLatitude},${record.releaseLongitude}`
      : null;

  const dm = confirmData?.distanceMetres ?? null;
  const distanceStatus: "ok" | "warn" | "stop" | "unknown" =
    dm === null ? "unknown" : dm <= 200 ? "ok" : dm <= 500 ? "warn" : "stop";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-card w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition-colors"
        >
          <X size={18} />
        </button>

        {record.imageUrl && (
          <div className="bg-black/5">
            <img
              src={record.imageUrl}
              alt={record.dogId}
              className="w-full max-h-[60vh] object-contain"
            />
          </div>
        )}

        <div className="p-4 space-y-3">
          <h2 className="font-mono font-bold text-xl text-foreground">{record.dogId}</h2>

          {/* Capture date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock size={16} className="flex-shrink-0" />
            <span>{formatDate(record.recordedAt)}</span>
          </div>

          {/* Capture location */}
          {(record.areaName || gpsLink) && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin size={16} className="flex-shrink-0 text-muted-foreground mt-0.5" />
              <div>
                {record.areaName && gpsLink ? (
                  <a
                    href={gpsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {record.areaName} · {record.latitude?.toFixed(5)}, {record.longitude?.toFixed(5)}
                    <ExternalLink size={12} />
                  </a>
                ) : record.areaName ? (
                  <span className="text-foreground">{record.areaName}</span>
                ) : gpsLink ? (
                  <a
                    href={gpsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    {record.latitude?.toFixed(5)}, {record.longitude?.toFixed(5)}
                    <ExternalLink size={12} />
                  </a>
                ) : null}
              </div>
            </div>
          )}

          {/* Notes */}
          {record.notes && (
            <div className="flex items-start gap-2 text-sm">
              <StickyNote size={16} className="flex-shrink-0 text-muted-foreground mt-0.5" />
              <p className="text-foreground">{record.notes}</p>
            </div>
          )}

          {/* AI Description */}
          {record.description && (
            <div className="bg-accent/50 rounded-lg p-3 border border-primary/10">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-primary mb-1">AI Description</p>
                  <p className="text-sm text-foreground leading-relaxed">{record.description}</p>
                </div>
              </div>
            </div>
          )}

          {/* Release info (if already released) */}
          {record.releasedAt && (
            <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-500/20 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={15}
                  className="text-green-600 dark:text-green-400 flex-shrink-0"
                />
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">Released</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-green-700/80 dark:text-green-400/80">
                <Clock size={12} className="flex-shrink-0" />
                <span>{formatDate(record.releasedAt)}</span>
              </div>
              {(record.releaseAreaName || releaseGpsLink) && (
                <div className="flex items-start gap-2 text-xs text-green-700/80 dark:text-green-400/80">
                  <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                  {record.releaseAreaName && releaseGpsLink ? (
                    <a
                      href={releaseGpsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-1"
                    >
                      {record.releaseAreaName}
                      <ExternalLink size={10} />
                    </a>
                  ) : record.releaseAreaName ? (
                    <span>{record.releaseAreaName}</span>
                  ) : releaseGpsLink ? (
                    <a
                      href={releaseGpsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-1"
                    >
                      {record.releaseLatitude?.toFixed(5)}, {record.releaseLongitude?.toFixed(5)}
                      <ExternalLink size={10} />
                    </a>
                  ) : null}
                </div>
              )}
              {record.releaseDistanceMetres != null && (
                <p className="text-xs text-green-700/70 dark:text-green-400/70 pl-[20px]">
                  {formatDistance(record.releaseDistanceMetres)} from capture
                </p>
              )}
            </div>
          )}

          {/* Custom Release Confirm Dialog */}
          {confirmData && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/60"
                onClick={handleCancelRelease}
              />
              <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
                {distanceStatus === "ok" && (
                  <>
                    <CheckCircle size={56} className="text-green-500" strokeWidth={1.5} />
                    <p className="text-3xl font-black tracking-tight text-green-600 text-center uppercase">
                      {formatDistanceLabel(dm!)}
                    </p>
                  </>
                )}
                {distanceStatus === "warn" && (
                  <>
                    <AlertTriangle size={56} className="text-yellow-500" strokeWidth={1.5} />
                    <p className="text-3xl font-black tracking-tight text-yellow-600 text-center uppercase">
                      {formatDistanceLabel(dm!)}
                    </p>
                    <p className="text-base font-bold text-yellow-600 text-center uppercase tracking-wide">
                      Are you sure?
                    </p>
                  </>
                )}
                {distanceStatus === "stop" && (
                  <>
                    <StopCircle size={56} className="text-red-500" strokeWidth={1.5} />
                    <p className="text-3xl font-black tracking-tight text-red-600 text-center uppercase">
                      {formatDistanceLabel(dm!)}
                    </p>
                    <p className="text-base font-bold text-red-600 text-center uppercase tracking-wide">
                      Do Not Release
                    </p>
                  </>
                )}
                {distanceStatus === "unknown" && (
                  <>
                    <AlertTriangle size={56} className="text-muted-foreground" strokeWidth={1.5} />
                    <p className="text-xl font-bold text-muted-foreground text-center">
                      Distance unavailable
                    </p>
                  </>
                )}

                <div className="flex gap-3 w-full mt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancelRelease}
                    disabled={confirming}
                  >
                    Cancel
                  </Button>
                  <Button
                    className={
                      distanceStatus === "stop"
                        ? "flex-1 bg-red-600 hover:bg-red-700 text-white"
                        : distanceStatus === "warn"
                        ? "flex-1 bg-yellow-500 hover:bg-yellow-600 text-white"
                        : "flex-1 bg-green-600 hover:bg-green-700 text-white"
                    }
                    onClick={handleConfirmRelease}
                    disabled={confirming}
                  >
                    {confirming ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Releasing…
                      </>
                    ) : (
                      "Release"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Released Button */}
          <Button
            variant="outline"
            className={
              released
                ? "w-full border-green-500/40 text-green-700 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-950/30 dark:hover:bg-green-900/40"
                : "w-full border-green-600/40 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30"
            }
            onClick={handleRelease}
            disabled={releasing || released}
          >
            {releasing ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Getting location…
              </>
            ) : released ? (
              <>
                <CheckCircle2 size={16} className="mr-2" />
                Released
              </>
            ) : (
              <>
                <CheckCircle2 size={16} className="mr-2" />
                Mark as Released
              </>
            )}
          </Button>

          {/* Delete Button */}
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Trash2 size={16} className="mr-2" />
            )}
            Delete Record
          </Button>
        </div>
      </div>
    </div>
  );
}
