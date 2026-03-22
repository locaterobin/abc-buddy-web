import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { resizeImage } from "@/lib/resizeImage";
import { enqueuePlanPhoto, removePlanPhotoFromQueue, getPendingPlanPhotos, updatePlanPhotoStatus } from "@/hooks/useOfflineQueue";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  CalendarCheck,
  CalendarPlus,
  Camera,
  Upload,
  Pencil,
  Save,
  ArrowRightLeft,
  ClipboardList,
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

/** Swipeable thumbnail carousel for the record detail modal */
function PhotoCarousel({
  photos,
  labels,
  dogId,
  onPhotoClick,
}: {
  photos: string[];
  labels: string[];
  dogId: string;
  onPhotoClick: (index: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const swipeStartX = useRef<number | null>(null);

  const goTo = (i: number) => {
    if (i >= 0 && i < photos.length) setActiveIndex(i);
  };

  return (
    <div className="relative bg-black/5 overflow-hidden">
      {/* Main photo */}
      <div
        className="cursor-zoom-in"
        onClick={() => onPhotoClick(activeIndex)}
        onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (swipeStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - swipeStartX.current;
          if (Math.abs(dx) > 40) {
            if (dx < 0) goTo(activeIndex + 1);
            else goTo(activeIndex - 1);
          }
          swipeStartX.current = null;
        }}
      >
        <img
          key={activeIndex}
          src={photos[activeIndex]}
          alt={`${dogId} ${labels[activeIndex]}`}
          className="w-full h-56 object-cover"
        />
      </div>
      {/* Label */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
        {labels[activeIndex]}
      </div>
      {/* Dot indicators */}
      {photos.length > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === activeIndex ? 'bg-white scale-125' : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-screen pinch-to-zoom image viewer with swipe-to-navigate carousel */
function LightboxViewer({
  photos,
  initialIndex = 0,
  alt,
  onClose,
}: {
  photos: string[];
  initialIndex?: number;
  alt: string;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const src = photos[currentIndex];
  const swipeStart = useRef<number | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const lastTap = useRef(0);
  const lastDist = useRef<number | null>(null);
  const lastTranslate = useRef({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Close on back button
  useEffect(() => {
    history.pushState({ lightbox: true }, "");
    const handlePop = () => onClose();
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []); // eslint-disable-line

  const clampTranslate = useCallback((x: number, y: number, s: number) => {
    const el = imgRef.current;
    if (!el) return { x, y };
    const maxX = Math.max(0, (el.clientWidth * (s - 1)) / 2);
    const maxY = Math.max(0, (el.clientHeight * (s - 1)) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      lastDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTranslate.current = translate;
    } else if (e.touches.length === 1) {
      // Double-tap detection
      const now = Date.now();
      if (now - lastTap.current < 300) {
        if (scale > 1) {
          setScale(1);
          setTranslate({ x: 0, y: 0 });
        } else {
          setScale(2.5);
        }
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      dragStart.current = { x: e.touches[0].clientX - translate.x, y: e.touches[0].clientY - translate.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && lastDist.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const newScale = Math.min(5, Math.max(1, scale * (dist / lastDist.current)));
      lastDist.current = dist;
      setScale(newScale);
      if (newScale === 1) setTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && dragStart.current && scale > 1) {
      const x = e.touches[0].clientX - dragStart.current.x;
      const y = e.touches[0].clientY - dragStart.current.y;
      setTranslate(clampTranslate(x, y, scale));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastDist.current = null;
    // Swipe left/right to navigate between photos (only when not zoomed)
    if (scale === 1 && swipeStart.current !== null && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - swipeStart.current;
      if (Math.abs(dx) > 50) {
        if (dx < 0 && currentIndex < photos.length - 1) setCurrentIndex(i => i + 1);
        if (dx > 0 && currentIndex > 0) setCurrentIndex(i => i - 1);
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      }
    }
    dragStart.current = null;
    swipeStart.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      onClick={() => { if (scale === 1) onClose(); }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 bg-black/60 text-white rounded-full p-2 hover:bg-black/80"
      >
        <X size={20} />
      </button>
      {/* Dot indicators */}
      {photos.length > 1 && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 z-10">
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); setScale(1); setTranslate({ x: 0, y: 0 }); }}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentIndex ? 'bg-white scale-125' : 'bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
      <div
        ref={imgRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
        onTouchStart={(e) => {
          if (e.touches.length === 1) swipeStart.current = e.touches[0].clientX;
          handleTouchStart(e);
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "none" }}
      >
        <img
          key={src}
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            transition: lastDist.current !== null ? "none" : "transform 0.1s ease",
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            userSelect: "none",
          }}
        />
      </div>
    </div>
  );
}

export default function RecordDetailModal({ record, onClose, onDelete }: RecordDetailModalProps) {
  const { teamId, webhookUrl, staffSession } = useTeam();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.dogs.deleteRecord.useMutation();
  const geocodeMutation = trpc.dogs.geocodeLatLng.useMutation();
  const saveReleaseMutation = trpc.dogs.saveRelease.useMutation();
  const webhookMutation = trpc.webhook.fire.useMutation();

  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState(() => !!record.releasedAt);
  const [confirmData, setConfirmData] = useState<ReleaseConfirmData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<number | null>(null);
  const [photo2Base64, setPhoto2Base64] = useState<string | null>(null);
  const photo2InputRef = useRef<HTMLInputElement>(null);
  const [photo3Base64, setPhoto3Base64] = useState<string | null>(null);
  const photo3InputRef = useRef<HTMLInputElement>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editDogId, setEditDogId] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editAreaName, setEditAreaName] = useState("");
  const [editLatitude, setEditLatitude] = useState("");
  const [editLongitude, setEditLongitude] = useState("");
  const [editRecordedAt, setEditRecordedAt] = useState("");
  const [editGender, setEditGender] = useState<"Unknown" | "Male" | "Female">("Unknown");
  const updateMutation = trpc.dogs.updateRecord.useMutation();

  function toLocalDatetimeValue(date: Date | string): string {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function enterEditMode() {
    setEditDogId(rec.dogId ?? "");
    setEditDescription(rec.description ?? "");
    setEditNotes(rec.notes ?? "");
    setEditAreaName(rec.areaName ?? "");
    setEditLatitude(rec.latitude != null ? String(rec.latitude) : "");
    setEditLongitude(rec.longitude != null ? String(rec.longitude) : "");
    setEditRecordedAt(rec.recordedAt ? toLocalDatetimeValue(rec.recordedAt) : "");
    setEditGender((rec.gender as "Unknown" | "Male" | "Female") ?? "Unknown");
    setEditMode(true);
  }

  async function handleSaveEdit() {
    const lat = editLatitude !== "" ? parseFloat(editLatitude) : null;
    const lng = editLongitude !== "" ? parseFloat(editLongitude) : null;
    // Fire update webhook immediately (client-side, before server call)
    if (webhookUrl) {
      const updatePayload = {
          event: "update",
          dogId: editDogId || rec.dogId,
          teamIdentifier: teamId,
          areaName: editAreaName || null,
          latitude: lat,
          longitude: lng,
          notes: editNotes || null,
          description: editDescription || null,
          gender: editGender,
          updatedByStaffId: staffSession?.staffId ?? null,
          updatedByStaffName: staffSession?.name ?? null,
        };
      fetch(webhookUrl.replace(/\/$/, "") + "/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      }).catch((e) => console.warn("Update webhook failed:", e));
      webhookMutation.mutate({ url: webhookUrl.replace(/\/$/, "") + "/update", payload: updatePayload });
    }
    try {
      await updateMutation.mutateAsync({
        id: rec.id,
        teamIdentifier: teamId,
        dogId: editDogId || undefined,
        description: editDescription || null,
        notes: editNotes || null,
        areaName: editAreaName || null,
        latitude: lat,
        longitude: lng,
        recordedAt: editRecordedAt ? new Date(editRecordedAt).toISOString() : undefined,
        gender: editGender,
        updatedByStaffId: staffSession?.staffId ?? null,
        updatedByStaffName: staffSession?.name ?? null,
      });
      toast.success("Record updated");
      setEditMode(false);
      utils.releasePlans.getFullRecord.invalidate({ dogId: rec.dogId });
      utils.dogs.getRecords.invalidate();
      utils.dogs.getRecordsPaginated.invalidate();
    } catch (err: any) {
      toast.error("Update failed: " + (err?.message || "Unknown error"));
    }
  }

  // Always fetch the full record (with photo2Url from release_plan_dogs) as the source of truth
  const { data: freshRecord } = trpc.releasePlans.getFullRecord.useQuery(
    { dogId: record.dogId },
    { enabled: !!record.dogId }
  );
  // Merge: use freshRecord when available, fall back to prop for initial render
  const rec = freshRecord ?? record;

  // Release plans
  const { data: plans = [] } = trpc.releasePlans.getPlans.useQuery(
    { teamIdentifier: teamId, sinceHours: 48 },
    { enabled: showPlanPicker }
  );
  // Load eagerly so the button can be disabled immediately
  const { data: dogPlanIds = [] } = trpc.releasePlans.getDogPlans.useQuery(
    { dogId: record.dogId },
    { enabled: !!record.dogId && !released }
  );
  const isInAnyPlan = dogPlanIds.length > 0;
  const isManager = staffSession?.role?.toLowerCase() === "manager";

  // Current plan details (for display + move feature)
  const { data: dogPlanDetails = [] } = trpc.releasePlans.getDogPlanDetails.useQuery(
    { dogId: record.dogId },
    { enabled: !!record.dogId && !released }
  );
  const currentPlan = dogPlanDetails[0] ?? null;

  // Move-to-plan state (manager only)
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [pendingMovePlan, setPendingMovePlan] = useState<{ id: number; planDate: string; orderIndex: number } | null>(null);
  const { data: allActivePlans = [] } = trpc.releasePlans.getPlans.useQuery(
    { teamIdentifier: teamId },
    { enabled: showMovePicker }
  );
  const moveDogMutation = trpc.releasePlans.moveDog.useMutation({
    onSuccess: () => {
      toast.success("Moved to new plan");
      utils.releasePlans.getDogPlans.invalidate({ dogId: record.dogId });
      utils.releasePlans.getDogPlanDetails.invalidate({ dogId: record.dogId });
      utils.releasePlans.getPlanDogs.invalidate();
      utils.releasePlans.getFullRecord.invalidate({ dogId: record.dogId });
      utils.dogs.getRecords.invalidate();
      setShowMovePicker(false);
    },
    onError: () => toast.error("Failed to move dog"),
  });

  // Replace checked photo
  const [replaceCheckedBase64, setReplaceCheckedBase64] = useState<string | null>(null);
  const [replacingChecked, setReplacingChecked] = useState(false);
  const replaceCheckedInputRef = useRef<HTMLInputElement>(null);
  const updateCheckedPhotoMutation = trpc.releasePlans.updateCheckedPhoto.useMutation({
    onSuccess: () => {
      toast.success("Checked photo updated");
      utils.releasePlans.getFullRecord.invalidate({ dogId: record.dogId });
      utils.dogs.getRecords.invalidate();
      setReplaceCheckedBase64(null);
      setReplacingChecked(false);
    },
    onError: () => { toast.error("Failed to update photo"); setReplacingChecked(false); },
  });

  const removeDogFromPlan = trpc.releasePlans.removeDog.useMutation({
    onSuccess: () => {
      toast.success("Removed from release plan");
      utils.releasePlans.getDogPlans.invalidate({ dogId: record.dogId });
      utils.releasePlans.getPlanDogs.invalidate();
      utils.dogs.getRecords.invalidate();
    },
    onError: () => toast.error("Failed to remove from plan"),
  });
  const addDogToPlan = trpc.releasePlans.addDog.useMutation({
    onSuccess: (added) => {
      if (added) toast.success("Added to release plan");
      else toast.info("Already in this plan");
      utils.releasePlans.getDogPlans.invalidate({ dogId: record.dogId });
      utils.releasePlans.getPlanDogs.invalidate();
      utils.releasePlans.getFullRecord.invalidate({ dogId: record.dogId });
      setPendingPlanId(null);
      setPhoto2Base64(null);
      setShowPlanPicker(false);
      onClose();
    },
    onError: () => toast.error("Failed to add to plan"),
  });

  async function handlePhoto2Change(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await resizeImage(file, 1280, 0.82);
      setPhoto2Base64(b64);
    } catch {
      toast.error("Failed to process image");
    }
    e.target.value = "";
  }

  async function handlePhoto3Change(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await resizeImage(file, 1280, 0.82);
      setPhoto3Base64(b64);
    } catch {
      toast.error("Failed to process image");
    }
    e.target.value = "";
  }

  function confirmAddToPlan(planId: number) {
    setPendingPlanId(planId);
    setPhoto2Base64(null);
  }

  async function submitAddToPlan() {
    if (pendingPlanId === null) return;
    const queueId = crypto.randomUUID();
    // Save to offline queue first
    await enqueuePlanPhoto({
      queueId,
      type: "checked",
      planId: pendingPlanId,
      dogId: record.dogId,
      photo2Base64: photo2Base64 ?? undefined,
    });
    // Try to sync immediately
    addDogToPlan.mutate(
      { planId: pendingPlanId, dogId: record.dogId, photo2Base64: photo2Base64 ?? undefined, addedByStaffId: staffSession?.staffId ?? null, addedByStaffName: staffSession?.name ?? null },
      {
        onSuccess: async (added) => {
          await removePlanPhotoFromQueue(queueId);
          if (added) toast.success("Added to release plan");
          else toast.info("Already in this plan");
        },
        onError: async () => {
          await updatePlanPhotoStatus(queueId, "failed", "Network error");
          toast("Saved offline — will sync when online", { icon: "📋" });
        },
      }
    );
  }

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
          utils.dogs.getRecordsPaginated.invalidate();
          if (webhookUrl) {
            const deleteUrl = webhookUrl.replace(/\/$/, "") + "/delete";
            const deletePayload = {
                event: "delete",
                dogId: record.dogId,
                teamIdentifier: teamId,
                deletedByStaffId: staffSession?.staffId ?? null,
                deletedByStaffName: staffSession?.name ?? null,
              };
            fetch(deleteUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(deletePayload),
            }).catch((e) => console.error("Delete webhook failed:", e));
            webhookMutation.mutate({ url: deleteUrl, payload: deletePayload });
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

    const releasedAt = new Date().toISOString();
    const distanceRounded = distanceMetres !== null ? Math.round(distanceMetres) : null;
    const queueId = crypto.randomUUID();
    // Save to offline queue first
    await enqueuePlanPhoto({
      queueId,
      type: "release",
      recordId: record.id,
      teamIdentifier: teamId,
      photo3Base64: photo3Base64 ?? undefined,
      releaseNotes: releasedAt,
      webhookUrl: webhookUrl ?? undefined,
    });
    try {
      // Save to DB
      const releaseResult = await saveReleaseMutation.mutateAsync({
        id: record.id,
        teamIdentifier: teamId,
        releasedAt,
        releaseLatitude: latitude,
        releaseLongitude: longitude,
        releaseAreaName: areaName || null,
        releaseDistanceMetres: distanceRounded,
        photo3Base64: photo3Base64 ?? undefined,
        releasedByStaffId: staffSession?.staffId ?? null,
        releasedByStaffName: staffSession?.name ?? null,
      });
      await removePlanPhotoFromQueue(queueId);

      // Fire webhook
      const releaseUrl = webhookUrl!.replace(/\/$/, "") + "/release";
      const payload = {
        event: "release",
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
        releasePhotoUrl: releaseResult?.releasePhotoUrl ?? null,
        releasedByStaffId: staffSession?.staffId ?? null,
        releasedByStaffName: staffSession?.name ?? null,
      };

      fetch(releaseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((e) => console.warn("Release webhook failed:", e));
      webhookMutation.mutate({ url: releaseUrl, payload });

      utils.dogs.getRecords.invalidate();
      setReleased(true);
      setConfirmData(null);
      setPhoto3Base64(null);
      const distanceMsg =
        distanceMetres !== null ? ` · ${formatDistance(distanceMetres)} from capture` : "";
      toast.success(`${record.dogId} marked as Released${distanceMsg}`);
    } catch (err: any) {
      await updatePlanPhotoStatus(queueId, "failed", err?.message || "Network error");
      // Still mark as released locally so UI reflects it
      setReleased(true);
      setConfirmData(null);
      setPhoto3Base64(null);
      toast("Release saved offline — will sync when online", { icon: "📋" });
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

        {/* Photo carousel: swipe left/right to see all photos */}
        {(() => {
          const photos = [rec.imageUrl, rec.photo2Url, rec.releasePhotoUrl].filter(Boolean) as string[];
          const labels = [rec.imageUrl && 'Catching', rec.photo2Url && 'Checked', rec.releasePhotoUrl && 'Release'].filter(Boolean) as string[];
          if (photos.length === 0) return null;
          return (
            <>
              {photos.length === 1 ? (
                <div className="cursor-zoom-in" onClick={() => setLightboxIndex(0)}>
                  <img
                    src={photos[0]}
                    alt={`${rec.dogId} capture`}
                    className="w-full max-h-[60vh] object-contain bg-black/5"
                  />
                </div>
              ) : (
                <PhotoCarousel
                  photos={photos}
                  labels={labels}
                  dogId={rec.dogId}
                  onPhotoClick={(i: number) => setLightboxIndex(i)}
                />
              )}
              {lightboxIndex !== null && (
                <LightboxViewer
                  photos={photos}
                  initialIndex={lightboxIndex}
                  alt={rec.dogId}
                  onClose={() => setLightboxIndex(null)}
                />
              )}
              {/* Replace Checked photo button — visible to all staff when a checked photo exists */}
              {rec.photo2Url && !released && (
                <div className="px-3 py-2 flex items-center justify-end gap-2 bg-black/5">
                  {replaceCheckedBase64 ? (
                    <>
                      <span className="text-xs text-muted-foreground">New checked photo selected</span>
                      <button
                        onClick={() => setReplaceCheckedBase64(null)}
                        className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded"
                      >Cancel</button>
                      <button
                        disabled={replacingChecked}
                        onClick={async () => {
                          setReplacingChecked(true);
                          updateCheckedPhotoMutation.mutate({ dogId: record.dogId, photo2Base64: replaceCheckedBase64 });
                        }}
                        className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-md font-medium disabled:opacity-50"
                      >{replacingChecked ? "Saving…" : "Save"}</button>
                    </>
                  ) : (
                    <button
                      onClick={() => replaceCheckedInputRef.current?.click()}
                      className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-black/10 transition-colors"
                    >
                      <Camera size={12} />
                      Replace checked photo
                    </button>
                  )}
                  <input
                    ref={replaceCheckedInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const resized = await resizeImage(file, 1200);
                      setReplaceCheckedBase64(resized);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </>
          );
        })()}

        <div className="p-4 space-y-3">
          {/* Header row: Dog ID + Edit + Delete buttons */}
          <div className="flex items-center justify-between">
            <h2 className="font-mono font-bold text-xl text-foreground">{rec.dogId}</h2>
            {!editMode && (
              <div className="flex items-center gap-2">
                <button
                  onClick={enterEditMode}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                {isManager && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          {editMode ? (
            /* ── EDIT MODE ── */
            <div className="space-y-3 border border-primary/20 rounded-xl p-3 bg-primary/5">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Dog ID</label>
                <Input value={editDogId} onChange={(e) => setEditDogId(e.target.value)} className="font-mono text-sm h-8" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Date &amp; Time</label>
                <Input type="datetime-local" value={editRecordedAt} onChange={(e) => setEditRecordedAt(e.target.value)} className="text-sm h-8" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Area / Location</label>
                <Input value={editAreaName} onChange={(e) => setEditAreaName(e.target.value)} placeholder="Area name" className="text-sm h-8" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Latitude</label>
                  <Input value={editLatitude} onChange={(e) => setEditLatitude(e.target.value)} placeholder="0.00000" className="font-mono text-sm h-8" />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Longitude</label>
                  <Input value={editLongitude} onChange={(e) => setEditLongitude(e.target.value)} placeholder="0.00000" className="font-mono text-sm h-8" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="text-sm resize-none" placeholder="Notes…" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Gender</label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value as "Unknown" | "Male" | "Female")}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="Unknown">Unknown</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} className="text-sm resize-none" placeholder="Description…" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditMode(false)} disabled={updateMutation.isPending}>
                  Cancel
                </Button>
                <Button size="sm" className="flex-1" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
                  Save Changes
                </Button>
              </div>
            </div>
          ) : (
            /* ── VIEW MODE ── */
            <>
              {/* Capture date */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock size={16} className="flex-shrink-0" />
                <span>{formatDate(rec.recordedAt)}</span>
              </div>

              {/* Capture location */}
              {(rec.areaName || gpsLink) && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin size={16} className="flex-shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    {rec.areaName && gpsLink ? (
                      <a href={gpsLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {rec.areaName} · {rec.latitude?.toFixed(5)}, {rec.longitude?.toFixed(5)}
                        <ExternalLink size={12} />
                      </a>
                    ) : rec.areaName ? (
                      <span className="text-foreground">{rec.areaName}</span>
                    ) : gpsLink ? (
                      <a href={gpsLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {rec.latitude?.toFixed(5)}, {rec.longitude?.toFixed(5)}
                        <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Notes */}
              {rec.notes && (
                <div className="flex items-start gap-2 text-sm">
                  <StickyNote size={16} className="flex-shrink-0 text-muted-foreground mt-0.5" />
                  <p className="text-foreground">{rec.notes}</p>
                </div>
              )}

              {/* AI Description */}
              {rec.description && (
                <div className="bg-accent/50 rounded-lg p-3 border border-primary/10">
                  <div className="flex items-start gap-2">
                    <Sparkles size={16} className="text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-primary mb-1">AI Description</p>
                      <p className="text-sm text-foreground leading-relaxed">{rec.description}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Release info (if already released) */}
          {rec.releasedAt && (
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
                <span>{formatDate(rec.releasedAt)}</span>
              </div>
              {(rec.releaseAreaName || releaseGpsLink) && (
                <div className="flex items-start gap-2 text-xs text-green-700/80 dark:text-green-400/80">
                  <MapPin size={12} className="flex-shrink-0 mt-0.5" />
                  {rec.releaseAreaName && releaseGpsLink ? (
                    <a
                      href={releaseGpsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-1"
                    >
                      {rec.releaseAreaName}
                      <ExternalLink size={10} />
                    </a>
                  ) : rec.releaseAreaName ? (
                    <span>{rec.releaseAreaName}</span>
                  ) : releaseGpsLink ? (
                    <a
                      href={releaseGpsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-1"
                    >
                      {rec.releaseLatitude?.toFixed(5)}, {rec.releaseLongitude?.toFixed(5)}
                      <ExternalLink size={10} />
                    </a>
                  ) : null}
                </div>
              )}
              {rec.releaseDistanceMetres != null && (
                <p className="text-xs text-green-700/70 dark:text-green-400/70 pl-[20px]">
                  {formatDistance(rec.releaseDistanceMetres)} from capture
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

                {/* Photo 3 capture */}
                <div className="w-full">
                  <p className="text-xs text-muted-foreground mb-2 text-center">Add a release photo (optional)</p>
                  {photo3Base64 ? (
                    <div className="relative">
                      <img src={photo3Base64} alt="release photo" className="w-full h-28 object-cover rounded-xl" />
                      <button
                        onClick={() => setPhoto3Base64(null)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >✕</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-card"
                        onClick={() => {
                          if (photo3InputRef.current) {
                            photo3InputRef.current.removeAttribute("capture");
                            photo3InputRef.current.click();
                          }
                        }}
                      >
                        <Upload size={16} className="mr-1.5" />
                        Upload
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          if (photo3InputRef.current) {
                            photo3InputRef.current.setAttribute("capture", "environment");
                            photo3InputRef.current.click();
                          }
                        }}
                      >
                        <Camera size={16} className="mr-1.5" />
                        Camera
                      </Button>
                    </div>
                  )}
                  <input
                    ref={photo3InputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhoto3Change}
                  />
                </div>

                <div className="flex gap-3 w-full">
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

          {/* Current plan info + Move button (manager only) */}
          {isInAnyPlan && !released && currentPlan && (
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <ClipboardList size={15} className="text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">In plan</span>
                <span className="font-mono font-semibold text-foreground">{currentPlan.planDate}-{currentPlan.orderIndex}</span>
              </div>
              {isManager && (
                <button
                  onClick={() => setShowMovePicker((v) => !v)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md hover:bg-primary/10"
                >
                  <ArrowRightLeft size={13} />
                  Move
                </button>
              )}
            </div>
          )}

          {/* Move-to-plan picker (manager only) */}
          {showMovePicker && isManager && (
            <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground px-4 pt-3 pb-1">Move to another plan:</p>
              {allActivePlans.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No other active plans available.</p>
              ) : (
                allActivePlans
                  .filter((p) => p.id !== currentPlan?.planId)
                  .map((plan) => (
                    <button
                      key={plan.id}
                      onClick={() => setPendingMovePlan({ id: plan.id, planDate: plan.planDate, orderIndex: plan.orderIndex })}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm border-b border-border/50 last:border-b-0 hover:bg-muted transition-colors text-foreground"
                    >
                      <span className="font-mono font-medium">{plan.planDate}-{plan.orderIndex}</span>
                      <ArrowRightLeft size={14} className="text-muted-foreground" />
                    </button>
                  ))
              )}
              <button
                onClick={() => setShowMovePicker(false)}
                className="w-full text-xs text-muted-foreground py-2 hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Move confirmation dialog */}
          {pendingMovePlan && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60" onClick={() => setPendingMovePlan(null)} />
              <div className="relative bg-card rounded-2xl shadow-2xl w-full max-w-xs p-6 flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
                <ArrowRightLeft size={40} className="text-primary" strokeWidth={1.5} />
                <div className="text-center space-y-1">
                  <p className="font-semibold text-foreground">Move to plan</p>
                  <p className="font-mono text-2xl font-bold text-primary">{pendingMovePlan.planDate}-{pendingMovePlan.orderIndex}</p>
                  {currentPlan && (
                    <p className="text-sm text-muted-foreground">
                      Moving from <span className="font-mono font-medium">{currentPlan.planDate}-{currentPlan.orderIndex}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setPendingMovePlan(null)}
                    disabled={moveDogMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      moveDogMutation.mutate({
                        dogId: record.dogId,
                        targetPlanId: pendingMovePlan.id,
                        movedByStaffId: staffSession?.staffId ?? null,
                        movedByStaffName: staffSession?.name ?? null,
                      });
                      setPendingMovePlan(null);
                    }}
                    disabled={moveDogMutation.isPending}
                  >
                    {moveDogMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Confirm Move"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Add to Release Plan Button — hidden when already in a plan */}
          {!isInAnyPlan && !released && (
            <Button
              variant="outline"
              className="w-full border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => { setShowPlanPicker((v) => !v); setPendingPlanId(null); setPhoto2Base64(null); }}
            >
              <CalendarPlus size={16} className="mr-2" />
              Add to Release Plan
            </Button>
          )}

          {/* Plan Picker */}
          {showPlanPicker && (
            <div className="border border-border rounded-xl overflow-hidden bg-muted/30">
              {plans.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No plans yet. Create one in the Releases tab.
                </p>
              ) : pendingPlanId !== null ? (
                /* Step 2: optional photo */
                <div className="p-4 space-y-3">
                  <p className="text-xs font-medium text-foreground">
                    Add a second photo? <span className="text-muted-foreground">(optional)</span>
                  </p>
                  {photo2Base64 ? (
                    <div className="relative">
                      <img src={photo2Base64} alt="photo2" className="w-full h-32 object-cover rounded-lg" />
                      <button
                        onClick={() => setPhoto2Base64(null)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                      >✕</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-card"
                        onClick={() => {
                          if (photo2InputRef.current) {
                            photo2InputRef.current.removeAttribute("capture");
                            photo2InputRef.current.click();
                          }
                        }}
                      >
                        <Upload size={16} className="mr-1.5" />
                        Upload
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          if (photo2InputRef.current) {
                            photo2InputRef.current.setAttribute("capture", "environment");
                            photo2InputRef.current.click();
                          }
                        }}
                      >
                        <Camera size={16} className="mr-1.5" />
                        Camera
                      </Button>
                    </div>
                  )}
                  <input
                    ref={photo2InputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhoto2Change}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setPendingPlanId(null)}
                    >Back</Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={submitAddToPlan}
                      disabled={addDogToPlan.isPending}
                    >
                      {addDogToPlan.isPending ? <Loader2 size={14} className="animate-spin" /> : "Confirm"}
                    </Button>
                  </div>
                </div>
              ) : (
                plans.map((plan) => {
                  const inPlan = dogPlanIds.includes(plan.id);
                  return (
                    <button
                      key={plan.id}
                      onClick={() => { if (!inPlan) confirmAddToPlan(plan.id); }}
                      disabled={inPlan || addDogToPlan.isPending}
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm border-b border-border/50 last:border-b-0 transition-colors ${
                        inPlan
                          ? "text-green-600 bg-green-50 dark:bg-green-950/20 cursor-default"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <span className="font-mono font-medium">{plan.planDate}-{plan.orderIndex}</span>
                      {inPlan ? (
                        <CalendarCheck size={15} className="text-green-600" />
                      ) : (
                        <CalendarPlus size={15} className="text-muted-foreground" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Released Button — only shown when dog is in a release plan and NOT yet released */}
          {(isInAnyPlan && !released) && (
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
          )}

          {/* Staff Audit Trail */}
          {(rec.addedByStaffName || rec.updatedByStaffName || rec.releasedByStaffName) && (
            <div className="border border-border/50 rounded-xl p-3 bg-muted/20 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Activity</p>
              {rec.addedByStaffName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Added by</span>
                  <span className="font-medium text-foreground">{rec.addedByStaffName}{rec.addedByStaffId ? ` (${rec.addedByStaffId})` : ""}</span>
                </div>
              )}
              {rec.updatedByStaffName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Last edited by</span>
                  <span className="font-medium text-foreground">{rec.updatedByStaffName}{rec.updatedByStaffId ? ` (${rec.updatedByStaffId})` : ""}</span>
                </div>
              )}
              {rec.releasedByStaffName && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Released by</span>
                  <span className="font-medium text-foreground">{rec.releasedByStaffName}{rec.releasedByStaffId ? ` (${rec.releasedByStaffId})` : ""}</span>
                </div>
              )}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
