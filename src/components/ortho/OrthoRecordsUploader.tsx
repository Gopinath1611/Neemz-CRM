import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Upload, Eye, Download, Trash2, Share2, FileText, Image as ImageIcon, MessageCircle, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  caseId: string;
  patientId: string;
  patientName?: string;
  patientPhone?: string | null;
}

const RECORD_TYPES = ["OPG", "X-Ray", "CT Scan", "CBCT", "Cephalogram", "Intraoral Photo", "Extraoral Photo", "Study Model", "Other"];

const BUCKET = "diagnostic-reports";

export default function OrthoRecordsUploader({ caseId, patientId, patientName, patientPhone }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordType, setRecordType] = useState("OPG");
  const [notes, setNotes] = useState("");
  const [viewer, setViewer] = useState<any | null>(null);
  const [shareTarget, setShareTarget] = useState<any | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePhone, setSharePhone] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (caseId) load();
  }, [caseId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("orthodontic_records" as any)
      .select("*")
      .eq("case_id", caseId)
      .order("uploaded_at", { ascending: false });
    if (error) toast.error("Failed to load records");
    setRecords((data as any[]) || []);
    setLoading(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!caseId) { toast.error("Save the ortho case first before uploading records"); return; }
    setUploading(true);
    let success = 0;

    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop() || "bin";
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `ortho/${patientId}/${caseId}/${Date.now()}_${safeName}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

        const { error: insErr } = await supabase.from("orthodontic_records" as any).insert({
          case_id: caseId,
          patient_id: patientId,
          record_type: recordType,
          file_name: file.name,
          file_url: pub.publicUrl,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || `application/${ext}`,
          notes: notes || null,
        });
        if (insErr) throw insErr;
        success++;
      } catch (e: any) {
        toast.error(`Upload failed: ${file.name}`, { description: e.message });
      }
    }

    if (success > 0) toast.success(`${success} record(s) uploaded`);
    setNotes("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploading(false);
    await load();
  }

  async function remove(rec: any) {
    if (!confirm(`Delete "${rec.file_name}"?`)) return;
    if (rec.file_path) {
      await supabase.storage.from(BUCKET).remove([rec.file_path]);
    }
    const { error } = await supabase.from("orthodontic_records" as any).delete().eq("id", rec.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Record deleted");
    await load();
  }

  function download(rec: any) {
    const a = document.createElement("a");
    a.href = rec.file_url;
    a.download = rec.file_name;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openShare(rec: any) {
    setShareTarget(rec);
    setShareEmail("");
    setSharePhone(patientPhone || "");
  }

  function shareWhatsApp() {
    if (!shareTarget) return;
    const phoneDigits = (sharePhone || "").replace(/\D/g, "");
    const msg = encodeURIComponent(
      `Hello ${patientName || ""},\n\nHere is your orthodontic record (${shareTarget.record_type}): ${shareTarget.file_url}\n\n— Dr Neemz Dentistry`
    );
    const url = phoneDigits ? `https://wa.me/${phoneDigits}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
  }

  function shareEmailFn() {
    if (!shareTarget) return;
    const subject = encodeURIComponent(`Orthodontic Record — ${shareTarget.record_type}`);
    const body = encodeURIComponent(
      `Hello ${patientName || ""},\n\nPlease find your orthodontic record (${shareTarget.record_type}) at the link below:\n\n${shareTarget.file_url}\n\nFile: ${shareTarget.file_name}\n\nRegards,\nDr Neemz Dentistry`
    );
    window.location.href = `mailto:${shareEmail}?subject=${subject}&body=${body}`;
  }

  async function copyLink(rec: any) {
    try {
      await navigator.clipboard.writeText(rec.file_url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  const isImage = (m?: string) => m?.startsWith("image/");
  const isPdf = (m?: string) => m === "application/pdf";

  return (
    <div className="space-y-4">
      {/* Upload bar */}
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-3">
          <Upload className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Upload Patient Records (OPG, X-Ray, CT Scan, etc.)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Record Type</Label>
            <Select value={recordType} onValueChange={setRecordType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RECORD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Input className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pre-treatment OPG" />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={uploading || !caseId}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {uploading ? "Uploading..." : "Choose Files"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              multiple
              accept="image/*,application/pdf,.dcm"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        </div>
        {!caseId && (
          <p className="text-[11px] text-amber-600 mt-2">Save the ortho case first to enable uploads.</p>
        )}
      </div>

      {/* Records grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Uploaded Records ({records.length})</h4>
        </div>

        {loading ? (
          <div className="text-center py-8 text-sm text-muted-foreground">Loading...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
            No records uploaded yet. Upload OPG, X-Ray, CT Scan, or any patient document above.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {records.map((r) => (
              <div key={r.id} className="border rounded-lg overflow-hidden bg-card">
                <div className="aspect-video bg-muted flex items-center justify-center cursor-pointer" onClick={() => setViewer(r)}>
                  {isImage(r.mime_type) ? (
                    <img src={r.file_url} alt={r.file_name} className="w-full h-full object-cover" />
                  ) : isPdf(r.mime_type) ? (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <FileText className="h-10 w-10" />
                      <span className="text-[10px] mt-1">PDF</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <FileText className="h-10 w-10" />
                      <span className="text-[10px] mt-1">{(r.mime_type || "FILE").split("/").pop()?.toUpperCase()}</span>
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <div className="flex items-start justify-between gap-1">
                    <Badge variant="secondary" className="text-[10px]">{r.record_type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{format(new Date(r.uploaded_at), "dd MMM yyyy")}</span>
                  </div>
                  <div className="text-xs font-medium truncate" title={r.file_name}>{r.file_name}</div>
                  {r.notes && <div className="text-[10px] text-muted-foreground truncate" title={r.notes}>{r.notes}</div>}
                  <div className="flex gap-1 pt-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => setViewer(r)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Download" onClick={() => download(r)}><Download className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Share" onClick={() => openShare(r)}><Share2 className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 ml-auto text-destructive" title="Delete" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Viewer */}
      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="secondary">{viewer?.record_type}</Badge>
              <span className="truncate">{viewer?.file_name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="bg-muted rounded-md max-h-[70vh] overflow-auto flex items-center justify-center">
            {viewer && isImage(viewer.mime_type) ? (
              <img src={viewer.file_url} alt={viewer.file_name} className="max-w-full max-h-[70vh] object-contain" />
            ) : viewer && isPdf(viewer.mime_type) ? (
              <iframe src={viewer.file_url} className="w-full h-[70vh]" title={viewer.file_name} />
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Preview not available. <Button variant="link" onClick={() => viewer && download(viewer)}>Download to view</Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => viewer && copyLink(viewer)}>Copy Link</Button>
            <Button variant="outline" onClick={() => viewer && download(viewer)}><Download className="h-4 w-4 mr-1" /> Download</Button>
            <Button onClick={() => { if (viewer) { openShare(viewer); setViewer(null); } }}><Share2 className="h-4 w-4 mr-1" /> Share</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={!!shareTarget} onOpenChange={(o) => !o && setShareTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
              <div className="font-medium text-foreground truncate">{shareTarget?.file_name}</div>
              <div>{shareTarget?.record_type}</div>
            </div>

            <div>
              <Label className="text-xs">WhatsApp Number (with country code)</Label>
              <div className="flex gap-2 mt-1">
                <Input value={sharePhone} onChange={(e) => setSharePhone(e.target.value)} placeholder="+91 98765 43210" />
                <Button onClick={shareWhatsApp} className="bg-green-600 hover:bg-green-700">
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-xs">Email Address</Label>
              <div className="flex gap-2 mt-1">
                <Input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="patient@email.com" />
                <Button onClick={shareEmailFn} variant="secondary" disabled={!shareEmail}>
                  <Mail className="h-4 w-4 mr-1" /> Email
                </Button>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={() => shareTarget && copyLink(shareTarget)}>
              Copy Public Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
