import { useState } from "react";
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
} from "lucide-react";

interface RecordDetailModalProps {
  record: any;
  onClose: () => void;
  onDelete?: () => void;
}

export default function RecordDetailModal({ record, onClose, onDelete }: RecordDetailModalProps) {
  const { teamId, webhookUrl } = useTeam();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.dogs.deleteRecord.useMutation();
  const geocodeMutation = trpc.dogs.geocodeLatLng.useMutation();

  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(false);

  const handleDelete = () => {
    if (!window.confirm("Are you sure you want to delete this record? This cannot be undone.")) {
      return;
    }
    deleteMutation.mutate(
      { id: record.id, teamIdentifier: teamId },
      {
        onSuccess: () => {
          toast.success("Record deleted");
          utils.dogs.getRecords.invalidate();
          onDelete?.();
          onClose();
        },
        onError: (err) => {
          toast.error("Delete failed: " + err.message);
        },
      }
    );
  };

  const handleRelease = async () => {
    if (!webhookUrl) {
      toast.error("No webhook URL configured. Set it in Settings.");
      return;
    }
    if (!window.confirm(`Mark ${record.dogId} as Released and notify the webhook?`)) {
      return;
    }

    setReleasing(true);
    try {
      // 1. Get current device GPS
      let latitude: number | null = null;
      let longitude: number | null = null;
      let areaName = "";

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
        // GPS unavailable — proceed without it
        toast("GPS unavailable — sending without location", { icon: "⚠️" });
      }

      // 2. Reverse geocode if we have GPS
      if (latitude !== null && longitude !== null) {
        try {
          const geo = await geocodeMutation.mutateAsync({ latitude, longitude });
          areaName = geo.areaName || "";
        } catch {
          // geocoding failed — continue without area name
        }
      }

      // 3. Current IST timestamp
      const now = new Date();
      const releasedAt = now.toISOString();

      // 4. POST to {webhookUrl}/release
      const releaseUrl = webhookUrl.replace(/\/$/, "") + "/release";
      const payload = {
        dogId: record.dogId,
        teamIdentifier: teamId,
        releasedAt,
        latitude,
        longitude,
        areaName: areaName || null,
      };

      const res = await fetch(releaseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Webhook responded with ${res.status}`);
      }

      setReleased(true);
      toast.success(`${record.dogId} marked as Released!`);
    } catch (err: any) {
      toast.error("Release failed: " + (err?.message || "Unknown error"));
    } finally {
      setReleasing(false);
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const gpsLink =
    record.latitude && record.longitude
      ? `https://www.google.com/maps?q=${record.latitude},${record.longitude}`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Image */}
        {record.imageUrl && (
          <div className="bg-black/5">
            <img
              src={record.imageUrl}
              alt={record.dogId}
              className="w-full max-h-[60vh] object-contain"
            />
          </div>
        )}

        {/* Details */}
        <div className="p-4 space-y-3">
          {/* Dog ID */}
          <h2 className="font-mono font-bold text-xl text-foreground">{record.dogId}</h2>

          {/* Date */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock size={16} className="flex-shrink-0" />
            <span>{formatDate(record.recordedAt)}</span>
          </div>

          {/* Location */}
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
