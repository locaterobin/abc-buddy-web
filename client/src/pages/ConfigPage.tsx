import { useState, useRef } from "react";
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
  Check,
  RefreshCw,
  Loader2,
  FileText,
  Upload,
} from "lucide-react";

function DocxTemplateSection() {
  const { teamId } = useTeam();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data, refetch } = trpc.settings.getDocxTemplate.useQuery(
    { teamIdentifier: teamId },
    { enabled: !!teamId }
  );

  const uploadMutation = trpc.settings.uploadDocxTemplate.useMutation({
    onSuccess: () => {
      toast.success("Template updated");
      refetch();
    },
    onError: () => toast.error("Upload failed"),
    onSettled: () => setUploading(false),
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !teamId) return;
    if (!file.name.endsWith(".docx")) {
      toast.error("Please upload a .docx file");
      return;
    }
    setUploading(true);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    uploadMutation.mutate({ teamIdentifier: teamId, fileBase64: b64, fileName: file.name });
    e.target.value = "";
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} className="text-primary" />
          <h3 className="font-semibold text-foreground">ABC Form Template</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Upload a custom .docx template to use when generating ABC forms. The bundled template is used if none is uploaded.
        </p>
        {data?.url && (
          <p className="text-xs text-green-600 dark:text-green-400 mb-3 truncate">
            Custom template active
          </p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleFile}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <><Loader2 size={14} className="mr-2 animate-spin" />Uploading…</>
          ) : (
            <><Upload size={14} className="mr-2" />{data?.url ? "Replace Template" : "Upload Template"}</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ConfigPage() {
  const { teamId, setTeamId, webhookUrl, setWebhookUrl } = useTeam();

  const [showTeamInput, setShowTeamInput] = useState(false);
  const [newTeamId, setNewTeamId] = useState("");
  const [webhookInput, setWebhookInput] = useState(webhookUrl);
  const [webhookSaved, setWebhookSaved] = useState(false);

  const generateMutation = trpc.dogs.generateTeamId.useMutation();

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
    toast.success("Webhook URL saved");
  };

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
                onKeyDown={(e) => e.key === "Enter" && handleChangeTeam()}
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

          <p className="text-xs text-muted-foreground mt-3">
            All records are isolated per team. Share your Team ID with teammates to access the same records.
          </p>
        </CardContent>
      </Card>

      {/* DOCX Template Upload */}
      <DocxTemplateSection />

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
            Fires on every new record save and on release events.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
