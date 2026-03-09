import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileJson,
  FileText,
  Clock,
  MapPin,
  Loader2,
  ChevronRight,
  Dog,
  Search,
  Calendar,
  X,
  CheckCircle2,
} from "lucide-react";
import RecordDetailModal from "@/components/RecordDetailModal";

type StatusFilter = "all" | "active" | "released";

export default function RecordsPage() {
  const { teamId } = useTeam();

  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [searchId, setSearchId] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const teamIdForQuery = useMemo(() => teamId, [teamId]);
  const recordsQuery = trpc.dogs.getRecords.useQuery(
    { teamIdentifier: teamIdForQuery },
    { enabled: !!teamIdForQuery }
  );

  const handleExportJson = () => {
    if (!recordsQuery.data || recordsQuery.data.length === 0) {
      toast.error("No records to export");
      return;
    }
    const data = JSON.stringify(recordsQuery.data, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abc-buddy-${teamId}-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export downloaded");
  };

  const allRecords = recordsQuery.data || [];
  const records = allRecords.filter((rec: any) => {
    const matchId = !searchId.trim() || rec.dogId?.toLowerCase().includes(searchId.trim().toLowerCase());
    const matchDate = !filterDate || (() => {
      const recDate = new Date(rec.recordedAt).toISOString().slice(0, 10);
      return recDate === filterDate;
    })();
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "released" && !!rec.releasedAt) ||
      (statusFilter === "active" && !rec.releasedAt);
    return matchId && matchDate && matchStatus;
  });

  const releasedCount = allRecords.filter((r: any) => !!r.releasedAt).length;
  const activeCount = allRecords.length - releasedCount;

  return (
    <div className="container py-4 pb-6 max-w-lg mx-auto space-y-5">
      <Card>
        <CardContent className="py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dog size={18} className="text-primary" />
              <h3 className="font-semibold text-foreground">Records</h3>
              <Badge variant="secondary" className="text-xs">
                {records.length}{allRecords.length !== records.length ? `/${allRecords.length}` : ""}
              </Badge>
            </div>
            <Button variant="outline" size="sm" className="bg-card" onClick={handleExportJson}>
              <FileJson size={14} className="mr-1.5" />
              Export JSON
            </Button>
          </div>

          {/* Status filter toggle */}
          <div className="flex gap-1.5 mb-3">
            {(["all", "active", "released"] as StatusFilter[]).map((s) => {
              const label =
                s === "all"
                  ? `All (${allRecords.length})`
                  : s === "active"
                  ? `Active (${activeCount})`
                  : `Released (${releasedCount})`;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md border transition-colors ${
                    statusFilter === s
                      ? s === "released"
                        ? "bg-green-600 text-white border-green-600"
                        : "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-input hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Search + Date filters */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Search by Dog ID…"
                className="pl-8 text-sm h-8"
              />
              {searchId && (
                <button onClick={() => setSearchId("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="relative">
              <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="pl-8 pr-2 h-8 text-sm rounded-md border border-input bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {filterDate && (
                <button onClick={() => setFilterDate("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Records list */}
          {recordsQuery.isLoading ? (
            <div className="py-8 text-center">
              <Loader2 size={24} className="animate-spin text-primary mx-auto" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-8 text-center">
              <Dog size={32} className="text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No records found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {records.map((rec: any) => (
                <div key={rec.id} className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedRecord(rec)}
                    className="flex-1 flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group text-left"
                  >
                    {/* Thumbnail */}
                    {rec.imageUrl ? (
                      <img
                        src={rec.imageUrl}
                        alt={rec.dogId}
                        className="w-[60px] h-[60px] rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-[60px] h-[60px] rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Dog size={24} className="text-muted-foreground" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-mono font-bold text-sm text-foreground">{rec.dogId}</p>
                        {rec.releasedAt && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-300/50 dark:border-green-700/50">
                            <CheckCircle2 size={9} />
                            Released
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Clock size={11} />
                        <span>
                          {new Date(rec.recordedAt).toLocaleDateString("en-IN", {
                            timeZone: "Asia/Kolkata",
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      {rec.areaName && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MapPin size={11} />
                          <span className="truncate">{rec.areaName}</span>
                        </div>
                      )}
                    </div>

                    <ChevronRight
                      size={18}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    />
                  </button>

                  <a
                    href={`/api/record/${rec.dogId}/docx?team=${encodeURIComponent(teamId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download Form (DOCX)"
                    className="flex-shrink-0 p-2 rounded-lg hover:bg-muted/70 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <FileText size={16} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {selectedRecord && (
        <RecordDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onDelete={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
}
