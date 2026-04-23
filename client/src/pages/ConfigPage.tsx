import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useTeam } from "@/contexts/TeamContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Loader2,
  MapPin,
  Save,
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

function ReleaseFarThresholdSection() {
  const { teamId } = useTeam();
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");

  const { data, refetch } = trpc.settings.getReleaseFarThreshold.useQuery(
    { teamIdentifier: teamId },
    { enabled: !!teamId }
  );

  // Sync input value from server when not actively editing
  const threshold = data?.threshold;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  if (!editing && threshold !== undefined && inputVal === "") setInputVal(String(threshold));

  const saveMutation = trpc.settings.saveReleaseFarThreshold.useMutation({
    onSuccess: () => {
      toast.success("Threshold saved");
      setEditing(false);
      refetch();
    },
    onError: () => toast.error("Failed to save threshold"),
  });

  function handleSave() {
    const val = parseInt(inputVal, 10);
    if (isNaN(val) || val < 50 || val > 5000) {
      toast.error("Enter a value between 50 and 5000 metres");
      return;
    }
    saveMutation.mutate({ teamIdentifier: teamId, threshold: val });
  }

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={18} className="text-destructive" />
          <h3 className="font-semibold text-foreground">Released-Far Threshold</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Dogs released more than this distance from their capture location are flagged as <span className="text-destructive font-medium">Released Far</span> and shown with a red indicator.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={50}
            max={5000}
            value={inputVal}
            onChange={(e) => { setEditing(true); setInputVal(e.target.value); }}
            className="w-28 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder={String(data?.threshold ?? 200)}
          />
          <span className="text-sm text-muted-foreground">metres</span>
          <Button
            size="sm"
            variant="default"
            disabled={saveMutation.isPending || !editing}
            onClick={handleSave}
            className="ml-auto"
          >
            {saveMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <><Save size={14} className="mr-1.5" />Save</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConfigPage() {
  return (
    <div className="container py-4 pb-6 max-w-lg mx-auto space-y-5">
      <ReleaseFarThresholdSection />
      <DocxTemplateSection />
    </div>
  );
}
