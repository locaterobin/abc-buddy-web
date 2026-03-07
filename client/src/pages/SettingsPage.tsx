import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Users,
  Webhook,
  FileJson,
  Clock,
  MapPin,
  Trash2,
  Check,
  RefreshCw,
  Loader2,
  ChevronRight,
  Dog,
} from "lucide-react";
import RecordDetailModal from "@/components/RecordDetailModal";

export default function SettingsPage() {
  const { teamId, setTeamId, webhookUrl, setWebhookUrl } = useTeam();

  const [showTeamInput, setShowTeamInput] = useState(false);
  const [newTeamId, setNewTeamId] = useState("");
  const [webhookInput, setWebhookInput] = useState(webhookUrl);
  const [webhookSaved, setWebhookSaved] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const generateMutation = trpc.dogs.generateTeamId.useMutation();

  const teamIdForQuery = useMemo(() => teamId, [teamId]);
  const recordsQuery = trpc.dogs.getRecords.useQuery(
    { teamIdentifier: teamIdForQuery },
    { enabled: !!teamIdForQuery }
  );

  const handleChangeTeam = () => {
    if (!newTeamId.trim()) return;
    setTeamId(newTeamId.trim().toLowerCase());
    setShowTeamInput(false);
    setNewTeamId("");
    toast.success("Switched to team: " + newTeamId.trim().toLowerCase());
  };

  const handleGenerateTeam = () => {
    const confirmed = window.confirm(
      "Generating a new Team ID will switch you to a new team. Make sure to save your current Team ID if you want to access these records later.\n\nCurrent Team ID: " +
        teamId
    );
    if (!confirmed) return;

    generateMutation.mutate(undefined, {
      onSuccess: (data) => {
        setTeamId(data.teamId);
        toast.success("New team created: " + data.teamId);
      },
      onError: (err) => {
        toast.error("Failed to generate team ID: " + err.message);
      },
    });
  };

  const handleSaveWebhook = () => {
    setWebhookUrl(webhookInput);
    setWebhookSaved(true);
    setTimeout(() => setWebhookSaved(false), 2000);
  };

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

  const records = recordsQuery.data || [];

  return (
    <div className="container py-4 pb-6 max-w-lg mx-auto space-y-5">
      {/* Team ID Section */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} className="text-primary" />
            <h3 className="font-semibold text-foreground">Team ID</h3>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Badge
              variant="secondary"
              className="font-mono text-sm px-3 py-1.5 bg-muted text-foreground"
            >
              {teamId}
            </Badge>
          </div>

          {showTeamInput ? (
            <div className="flex gap-2 mb-3">
              <Input
                value={newTeamId}
                onChange={(e) => setNewTeamId(e.target.value)}
                placeholder="Enter team ID"
                className="font-mono"
              />
              <Button size="sm" onClick={handleChangeTeam} disabled={!newTeamId.trim()}>
                Apply
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowTeamInput(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                onClick={() => setShowTeamInput(true)}
              >
                Change
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="bg-card"
                onClick={handleGenerateTeam}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw size={14} className="mr-1.5" />
                )}
                Generate New
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhook Section */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <Webhook size={18} className="text-primary" />
            <h3 className="font-semibold text-foreground">Webhook URL</h3>
          </div>
          <div className="flex gap-2">
            <Input
              value={webhookInput}
              onChange={(e) => setWebhookInput(e.target.value)}
              placeholder="https://hooks.example.com/..."
              className="text-sm"
            />
            <Button size="sm" onClick={handleSaveWebhook}>
              {webhookSaved ? (
                <>
                  <Check size={14} className="mr-1" />
                  Saved
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Webhook fires on every new record save with the full record payload.
          </p>
        </CardContent>
      </Card>

      {/* Records Section */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dog size={18} className="text-primary" />
              <h3 className="font-semibold text-foreground">Records</h3>
              <Badge variant="secondary" className="text-xs">
                {records.length}
              </Badge>
            </div>
            <Button variant="outline" size="sm" className="bg-card" onClick={handleExportJson}>
              <FileJson size={14} className="mr-1.5" />
              Export JSON
            </Button>
          </div>

          {recordsQuery.isLoading ? (
            <div className="py-8 text-center">
              <Loader2 size={24} className="animate-spin text-primary mx-auto" />
            </div>
          ) : records.length === 0 ? (
            <div className="py-8 text-center">
              <Dog size={32} className="text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted-foreground">No records yet</p>
            </div>
          ) : (
            <div className="space-y-1">
              {records.map((rec: any) => (
                <button
                  key={rec.id}
                  onClick={() => setSelectedRecord(rec)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group text-left"
                >
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
                  <div className="flex-1 min-w-0">
                    <p className="font-mono font-bold text-sm text-foreground">{rec.dogId}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Clock size={11} />
                      <span>
                        {new Date(rec.recordedAt).toLocaleDateString("en-GB", {
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
