import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Trash2, Plus, ExternalLink, CalendarDays } from "lucide-react";
import { toast } from "sonner";

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

export default function ReleasePlanPage() {
  const { teamId: teamIdentifier } = useTeam();
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

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

  function handleCreatePlan() {
    if (!teamIdentifier) return;
    const date = todayYYMMDD();
    // Check if plan for today already exists
    const existing = plans.find((p) => p.planDate === date);
    if (existing) {
      setSelectedPlanId(existing.id);
      toast.info("Plan for today already exists");
      return;
    }
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
    // Multi-stop: origin + destination + waypoints
    const origin = coords[0];
    const destination = coords[coords.length - 1];
    const waypoints = coords.slice(1, -1).join("|");
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) url += `&waypoints=${waypoints}`;
    return url;
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  // ── Plan Detail View ──────────────────────────────────────────────────────────
  if (selectedPlanId !== null && selectedPlan) {
    const mapsUrl = buildMapsUrl(planDogs);
    const dogsWithCoords = planDogs.filter((d) => d.latitude != null && d.longitude != null);

    return (
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

        {/* Google Maps link */}
        {mapsUrl && (
          <div className="px-4 pt-3">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full bg-primary/10 hover:bg-primary/20 text-primary rounded-xl px-4 py-3 transition-colors font-medium text-sm"
            >
              <MapPin size={16} />
              Open all {dogsWithCoords.length} location{dogsWithCoords.length !== 1 ? "s" : ""} in Google Maps
              <ExternalLink size={14} className="ml-auto" />
            </a>
          </div>
        )}

        {/* Dogs list */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-2">
          {dogsLoading ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Loading…</div>
          ) : planDogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
              No dogs in this plan yet.
              <br />
              Open a record and tap "Add to Release Plan".
            </div>
          ) : (
            planDogs.map((dog) => (
              <Card key={dog.id} className="border border-border/60">
                <CardContent className="p-3 flex items-center gap-3">
                  {/* Photo 1 */}
                  {dog.imageUrl ? (
                    <img
                      src={dog.imageUrl}
                      alt={dog.dogId}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <span className="text-muted-foreground text-xs">No img</span>
                    </div>
                  )}
                  {/* Photo 2 (if added when adding to plan) */}
                  {dog.photo2Url && (
                    <img
                      src={dog.photo2Url}
                      alt={`${dog.dogId} photo2`}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 ring-2 ring-primary/30"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-foreground">{dog.dogId}</span>
                      {dog.releasedAt && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-400 bg-green-50">
                          Released
                        </Badge>
                      )}
                    </div>
                    {dog.areaName && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{dog.areaName}</p>
                    )}
                    {dog.latitude != null && dog.longitude != null && (
                      <p className="text-xs text-muted-foreground/70 font-mono">
                        {dog.latitude.toFixed(5)}, {dog.longitude.toFixed(5)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeDog.mutate({ planId: selectedPlanId, dogId: dog.dogId })}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
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
