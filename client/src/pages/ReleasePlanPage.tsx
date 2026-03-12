import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Map, Trash2, Plus, CalendarDays, Clock, CheckCircle2, Dog, GripVertical } from "lucide-react";
import { toast } from "sonner";
import RecordDetailModal from "@/components/RecordDetailModal";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Format YYMMDD → "Mon, 10 Mar 2026"
function formatPlanDate(yymmdd: string): string {
  if (yymmdd.length !== 6) return yymmdd;
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  const fullYear = parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`;
  const d = new Date(`${fullYear}-${mm}-${dd}T00:00:00+05:30`);
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Get today's date as YYMMDD in IST
function todayYYMMDD(): string {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const yy = String(ist.getFullYear()).slice(2);
  const mm = String(ist.getMonth() + 1).padStart(2, "0");
  const dd = String(ist.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

// Sortable dog card
function SortableDogCard({
  dog,
  onOpen,
  onRemove,
}: {
  dog: any;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dog.dogId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border border-border/60 hover:border-primary/40 hover:bg-muted/30 transition-colors">
        <CardContent className="p-3 flex items-center gap-2">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </button>

          {/* Photo thumbnail — clickable */}
          <div className="cursor-pointer" onClick={onOpen}>
            {dog.imageUrl ? (
              <img
                src={dog.imageUrl}
                alt={dog.dogId}
                className="w-[56px] h-[56px] rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-[56px] h-[56px] rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Dog size={22} className="text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Info — clickable */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-mono font-bold text-sm text-foreground">{dog.dogId}</p>
              {dog.releasedAt && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-300/50 dark:border-green-700/50">
                  <CheckCircle2 size={9} />
                  Released
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Clock size={11} />
              <span>{dog.recordedAt ? new Date(dog.recordedAt).toLocaleString() : ""}</span>
            </div>
            {dog.areaName && (
              <p className="text-xs text-muted-foreground truncate">{dog.areaName}</p>
            )}
          </div>

          {/* Remove button */}
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
          >
            <Trash2 size={15} />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReleasePlanPage() {
  const { teamId: teamIdentifier } = useTeam();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  // Local order state for optimistic drag reorder
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const utils = trpc.useUtils();

  // Plans list
  const { data: plans = [], isLoading: plansLoading } = trpc.releasePlans.getPlans.useQuery(
    { teamIdentifier },
    { enabled: !!teamIdentifier }
  );

  // Plan dogs (when a plan is selected)
  const { data: planDogs = [], isLoading: dogsLoading } = trpc.releasePlans.getPlanDogs.useQuery(
    { planId: selectedPlanId! },
    { enabled: selectedPlanId !== null }
  );

  // Reset local order whenever server data refreshes
  const planDogsKey = planDogs.map((d) => d.dogId).join(",");
  // We use a ref-free approach: if localOrder has same set as planDogs, keep it; otherwise reset
  // (handled in orderedDogs computation below)

  const createPlan = trpc.releasePlans.createPlan.useMutation({
    onSuccess: () => {
      utils.releasePlans.getPlans.invalidate();
      toast.success("Release plan created");
    },
    onError: () => toast.error("Failed to create plan"),
  });

  const deletePlan = trpc.releasePlans.deletePlan.useMutation({
    onSuccess: () => {
      utils.releasePlans.getPlans.invalidate();
      setSelectedPlanId(null);
      toast.success("Plan deleted");
    },
    onError: () => toast.error("Failed to delete plan"),
  });

  const removeDog = trpc.releasePlans.removeDog.useMutation({
    onSuccess: () => {
      utils.releasePlans.getPlanDogs.invalidate({ planId: selectedPlanId! });
      toast.success("Dog removed from plan");
    },
    onError: () => toast.error("Failed to remove dog"),
  });

  const reorderDogs = trpc.releasePlans.reorderDogs.useMutation({
    onError: () => {
      setLocalOrder(null);
      toast.error("Failed to save order");
    },
  });

  function handleCreatePlan() {
    if (!teamIdentifier) return;
    const date = todayYYMMDD();
    createPlan.mutate({ teamIdentifier, planDate: date });
  }

  function buildMapsUrl(dogs: typeof planDogs): string {
    const coords = dogs
      .filter((d) => d.latitude != null && d.longitude != null)
      .map((d) => `${d.latitude},${d.longitude}`);
    if (coords.length === 0) return "";
    if (coords.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${coords[0]}`;
    }
    const origin = coords[0];
    const destination = coords[coords.length - 1];
    const waypoints = coords.slice(1, -1).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    return url;
  }

  // Drag sensors — pointer (mouse/stylus) + touch
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Ordered dogs list (local optimistic order takes priority)
  const orderedDogs = localOrder
    ? localOrder.map((id) => planDogs.find((d) => d.dogId === id)).filter(Boolean) as typeof planDogs
    : planDogs;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = orderedDogs.map((d) => d.dogId);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(newOrder);

    reorderDogs.mutate(
      { planId: selectedPlanId!, orderedDogIds: newOrder },
      {
        onSuccess: () => {
          utils.releasePlans.getPlanDogs.invalidate({ planId: selectedPlanId! });
        },
      }
    );
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  // ── Plan Detail View ──────────────────────────────────────────────────────────
  if (selectedPlanId !== null && selectedPlan) {
    const mapsUrl = buildMapsUrl(orderedDogs);
    const dogsWithCoords = orderedDogs.filter((d) => d.latitude != null && d.longitude != null);

    return (
      <>
        <div className="flex flex-col h-full bg-background">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
            <button
              onClick={() => setSelectedPlanId(null)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft size={20} className="text-foreground" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-foreground text-base leading-tight">
                Plan {selectedPlan.planDate}-{selectedPlan.orderIndex}
              </h2>
              <p className="text-xs text-muted-foreground">{formatPlanDate(selectedPlan.planDate)}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
              onClick={() => {
                if (confirm("Delete this entire release plan?")) {
                  deletePlan.mutate({ planId: selectedPlanId, teamIdentifier });
                }
              }}
            >
              <Trash2 size={16} />
            </Button>
          </div>

          {/* Google Maps button */}
          {mapsUrl && (
            <div className="px-4 pt-3">
              <Button
                asChild
                className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <Map size={17} />
                  Open {dogsWithCoords.length} location{dogsWithCoords.length !== 1 ? "s" : ""} in Maps
                </a>
              </Button>
            </div>
          )}

          {/* Dogs list */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
            {dogsLoading ? (
              <div className="text-center text-muted-foreground py-8 text-sm">Loading…</div>
            ) : orderedDogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-sm">
                <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
                No dogs in this plan yet.
                <br />
                Open a record and tap "Add to Release Plan".
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={orderedDogs.map((d) => d.dogId)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedDogs.map((dog) => (
                    <SortableDogCard
                      key={dog.dogId}
                      dog={dog}
                      onOpen={() => setSelectedRecord(dog)}
                      onRemove={() => removeDog.mutate({ planId: selectedPlanId, dogId: dog.dogId })}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* Record Detail Modal */}
        {selectedRecord && (
          <RecordDetailModal
            record={selectedRecord}
            onClose={() => {
              setSelectedRecord(null);
              utils.releasePlans.getPlanDogs.invalidate();
            }}
            onDelete={() => {
              setSelectedRecord(null);
              utils.releasePlans.getPlanDogs.invalidate();
            }}
          />
        )}
      </>
    );
  }

  // ── Plans List View ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <h2 className="font-bold text-foreground text-base">Release Plans</h2>
        <Button
          size="sm"
          onClick={handleCreatePlan}
          disabled={createPlan.isPending}
          className="gap-1.5"
        >
          <Plus size={15} />
          New Plan
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
        {plansLoading ? (
          <div className="text-center text-muted-foreground py-8 text-sm">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">
            <CalendarDays size={40} className="mx-auto mb-3 opacity-25" />
            <p className="font-medium">No release plans yet</p>
            <p className="text-xs mt-1">Tap "New Plan" to create one for today.</p>
          </div>
        ) : (
          plans.map((plan) => (
            <Card
              key={plan.id}
              className="border border-border/60 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
              onClick={() => setSelectedPlanId(plan.id)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <CalendarDays size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-bold text-foreground text-sm">{plan.planDate}-{plan.orderIndex}</p>
                  <p className="text-xs text-muted-foreground">{formatPlanDate(plan.planDate)}</p>
                </div>
                <ArrowLeft size={16} className="text-muted-foreground rotate-180" />
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
