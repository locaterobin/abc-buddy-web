import { useState, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getCachedRecords, setCachedRecords } from "@/hooks/useRecordCache";
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

const PAGE_SIZE = 50;

export default function RecordsPage() {
  const { teamId } = useTeam();

  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [filterDate, setFilterDate] = useState(() => {
    try { return localStorage.getItem("records_filterDate") ?? ""; } catch { return ""; }
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [cachedRecords, setCachedRecordsState] = useState<any[]>([]);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load IndexedDB cache on mount for instant display
  useEffect(() => {
    if (!teamId) return;
    getCachedRecords(teamId).then((cached) => {
      setCachedRecordsState(cached);
      setCacheLoaded(true);
    });
  }, [teamId]);

  // Debounce search input
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
      setAllRecords([]);
    }, 350);
  }, []);

  // Persist filterDate to localStorage
  useEffect(() => {
    try { localStorage.setItem("records_filterDate", filterDate); } catch {}
  }, [filterDate]);

  // Reset when filters change
  useEffect(() => {
    setPage(1);
    setAllRecords([]);
  }, [filterDate, statusFilter]);

  const query = trpc.dogs.getRecordsPaginated.useQuery(
    {
      teamIdentifier: teamId,
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      dateFrom: filterDate || undefined,
      dateTo: filterDate || undefined,
      status: statusFilter,
    },
    { enabled: !!teamId }
  );

  // Accumulate pages + update IndexedDB cache when first page loads
  useEffect(() => {
    if (!query.data) return;
    if (page === 1) {
      setAllRecords(query.data.records);
      // Update cache with fresh first-page data (only when no filters active)
      if (!search && !filterDate && statusFilter === "all" && teamId) {
        setCachedRecords(teamId, query.data.records);
      }
    } else {
      setAllRecords((prev) => {
        const existingIds = new Set(prev.map((r: any) => r.id));
        const newOnes = query.data!.records.filter((r: any) => !existingIds.has(r.id));
        return [...prev, ...newOnes];
      });
    }
  }, [query.data, page, search, filterDate, statusFilter, teamId]);

  const handleExportJson = () => {
    if (allRecords.length === 0) {
      toast.error("No records to export");
      return;
    }
    const data = JSON.stringify(allRecords, null, 2);
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

  const total = query.data?.total ?? 0;
  const hasMore = query.data?.hasMore ?? false;
  // Show cached records while the first server fetch is in flight
  const displayRecords = (query.isLoading && page === 1 && cacheLoaded && cachedRecords.length > 0)
    ? cachedRecords
    : allRecords;
  const isLoading = query.isLoading && page === 1 && cachedRecords.length === 0;
  const isLoadingMore = query.isFetching && page > 1;
  const showingCache = query.isLoading && page === 1 && cachedRecords.length > 0;

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
                {allRecords.length}{total > allRecords.length ? `/${total}` : ""}
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
                s === "all" ? "All" : s === "active" ? "Active" : "Released";
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
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by Dog ID…"
                className="pl-8 text-sm h-8"
              />
              {searchInput && (
                <button
                  onClick={() => { handleSearchChange(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
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
                <button
                  onClick={() => setFilterDate("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Cache refresh indicator */}
          {showingCache && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Loader2 size={11} className="animate-spin" />
              <span>Refreshing…</span>
            </div>
          )}

          {/* Records list */}
          {isLoading ? (
            <div className="py-8 text-center">
              <Loader2 size={24} className="animate-spin text-primary mx-auto" />
            </div>
          ) : displayRecords.length === 0 ? (
            <div className="py-8 text-center">
              <Dog size={32} className="text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No records found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayRecords.map((rec: any) => (
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
                        {!rec.releasedAt && rec.inReleasePlan && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 border border-yellow-300/50 dark:border-yellow-700/50">
                            <CheckCircle2 size={9} />
                            Checked
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

              {/* Load More */}
              {hasMore && (
                <div className="pt-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={isLoadingMore}
                    className="w-full"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 size={14} className="mr-2 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      `Load more (${total - allRecords.length} remaining)`
                    )}
                  </Button>
                </div>
              )}
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
