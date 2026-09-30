import { useState, useRef } from "react";
import { Instagram, Facebook, Youtube, Linkedin, Twitter, Send, Image, Video, FileText, Clock, Sparkles, X, Upload, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UploadedFile {
  name: string;
  url: string;
  type: string;
  size: number;
}

const platforms = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500", bg: "bg-pink-500/10" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-600", bg: "bg-blue-600/10" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "text-red-500", bg: "bg-red-500/10" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-blue-500", bg: "bg-blue-500/10" },
  { id: "twitter", label: "X (Twitter)", icon: Twitter, color: "text-foreground", bg: "bg-muted" },
];

const postTypes = ["Image Post", "Video/Reel", "Carousel", "Story", "Text Post", "Poll"];
const LIVE_PLATFORMS = ["instagram", "facebook"];

const PostCreator = () => {
  const { toast } = useToast();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [form, setForm] = useState({
    caption: "",
    postType: "",
    hashtags: "",
    scheduleDate: "",
    scheduleTime: "",
    linkUrl: "",
  });

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<null | "publish" | "draft">(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const togglePlatform = (id: string) => {
    if (!LIVE_PLATFORMS.includes(id)) return;
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        toast({ title: "File too large", description: `${file.name} exceeds 100MB limit`, variant: "destructive" });
        continue;
      }

      const fileExt = file.name.split('.').pop();
      const filePath = `posts/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error } = await supabase.storage.from('social-media').upload(filePath, file);
      if (error) {
        toast({ title: "Upload failed", description: error.message, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from('social-media').getPublicUrl(filePath);
      newFiles.push({ name: file.name, url: urlData.publicUrl, type: file.type, size: file.size });
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setUploading(false);
    if (newFiles.length > 0) {
      toast({ title: `${newFiles.length} file(s) uploaded` });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (url: string) => {
    setUploadedFiles(prev => prev.filter(f => f.url !== url));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const validate = (): string | null => {
    if (selectedPlatforms.length === 0) return "குறைந்தது ஒரு platform select செய்யுங்கள்";
    if (uploading) return "Wait for the media upload to finish";
    if (!form.caption.trim()) return "Caption is required";
    if (form.caption.length > 2200 && selectedPlatforms.includes("instagram")) return "Instagram captions allow up to 2,200 characters";
    const media = uploadedFiles.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"));
    const images = media.filter(f => f.type.startsWith("image/"));
    const videos = media.filter(f => f.type.startsWith("video/"));
    if (selectedPlatforms.includes("instagram") && media.length === 0) return "Instagram needs at least one photo or video";
    if (form.postType === "Carousel" && (images.length < 2 || images.length > 10)) return "Carousel needs 2–10 images";
    if (form.postType === "Video/Reel" && videos.length !== 1) return "Video/Reel needs exactly one video";
    if (form.postType === "Story" && media.length !== 1) return "Story needs exactly one photo or video";
    if (selectedPlatforms.includes("instagram") && media.length > 10) return "Instagram allows at most 10 items";
    return null;
  };

  const savePost = async (status: "draft" | "publishing") => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Please sign in again");
    const media = uploadedFiles
      .filter(f => f.type.startsWith("image/") || f.type.startsWith("video/"))
      .map(f => ({ url: f.url, type: f.type }));
    const { data, error } = await supabase.from("social_posts").insert({
      created_by: user.id,
      caption: form.caption.trim(),
      hashtags: form.hashtags.trim() || null,
      link_url: form.linkUrl.trim() || null,
      post_type: form.postType || null,
      media,
      platforms: selectedPlatforms,
      status,
    }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };

  const resetForm = () => {
    setForm({ caption: "", postType: "", hashtags: "", scheduleDate: "", scheduleTime: "", linkUrl: "" });
    setUploadedFiles([]);
    setSelectedPlatforms([]);
  };

  const handleDraft = async () => {
    if (selectedPlatforms.length === 0 && !form.caption.trim()) {
      toast({ title: "Nothing to save", description: "Add a caption or select a platform", variant: "destructive" });
      return;
    }
    setBusy("draft");
    try {
      await savePost("draft");
      toast({ title: "Draft saved" });
    } catch (e: any) {
      toast({ title: "Could not save draft", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handlePostNow = async () => {
    if (busy) return;
    const err = validate();
    if (err) { toast({ title: "Check your post", description: err, variant: "destructive" }); return; }
    setBusy("publish");
    try {
      const postId = await savePost("publishing");
      const { data, error } = await supabase.functions.invoke("social-publish", {
        body: { post_id: postId, platforms: selectedPlatforms },
      });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = typeof b.error === "string" ? b.error : JSON.stringify(b.error); } catch { /* ignore */ }
        throw new Error(msg);
      }
      const results: any[] = data?.results || [];
      for (const r of results) {
        const label = r.platform === "facebook" ? "Facebook" : "Instagram";
        if (r.status === "published") {
          toast({ title: `Published to ${label} successfully`, description: r.permalink || undefined });
        } else {
          toast({ title: `${label} failed`, description: `${r.error_message}${r.error_code ? ` (code ${r.error_code})` : ""}`, variant: "destructive" });
        }
      }
      if (data?.status === "published") resetForm();
    } catch (e: any) {
      toast({ title: "Publishing failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Selection */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-display">Select Platforms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {platforms.map(p => {
              const selected = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  disabled={!LIVE_PLATFORMS.includes(p.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    selected
                      ? `border-primary ${p.bg} shadow-md`
                      : "border-border hover:border-muted-foreground/30"
                  }`}
                >
                  <p.icon size={18} className={selected ? p.color : "text-muted-foreground"} />
                  <span className={`text-sm font-medium ${selected ? "text-foreground" : "text-muted-foreground"}`}>
                    {p.label}
                  </span>
                  {!LIVE_PLATFORMS.includes(p.id) && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-4">Coming soon</Badge>
                  )}
                  {selected && (
                    <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5 h-4">✓</Badge>
                  )}
                </button>
              );
            })}
          </div>
          {selectedPlatforms.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {selectedPlatforms.length} platform(s) selected — post will be published to all
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Post Content */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">Post Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Post Type</Label>
              <Select value={form.postType} onValueChange={v => setForm(f => ({ ...f, postType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {postTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Caption / Content</Label>
              <Textarea
                value={form.caption}
                onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                placeholder="Write your post caption..."
                className="min-h-[140px]"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{form.caption.length} characters</span>
                <Button variant="ghost" size="sm" className="text-xs text-accent h-7">
                  <Sparkles size={12} className="mr-1" /> AI Generate Caption
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Media Upload</Label>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/mov,video/avi,video/quicktime,audio/mp3,audio/mpeg,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/40 transition-colors cursor-pointer"
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={24} className="animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-center gap-4 mb-3">
                      <Image size={24} className="text-muted-foreground" />
                      <Video size={24} className="text-muted-foreground" />
                      <Upload size={24} className="text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Click to upload images, videos, or documents</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG, MP4, MOV, MP3, PDF — up to 100MB</p>
                  </>
                )}
              </div>

              {uploadedFiles.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                  {uploadedFiles.map((file) => (
                    <div key={file.url} className="relative group rounded-lg border border-border overflow-hidden bg-muted/30">
                      {file.type.startsWith('image/') ? (
                        <img src={file.url} alt={file.name} className="w-full h-24 object-cover" />
                      ) : file.type.startsWith('video/') ? (
                        <video src={file.url} className="w-full h-24 object-cover" />
                      ) : (
                        <div className="w-full h-24 flex items-center justify-center">
                          <FileText size={28} className="text-muted-foreground" />
                        </div>
                      )}
                      <div className="px-2 py-1.5">
                        <p className="text-[10px] font-medium truncate">{file.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(file.url); }}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Hashtags</Label>
              <Input
                value={form.hashtags}
                onChange={e => setForm(f => ({ ...f, hashtags: e.target.value }))}
                placeholder="#DentalCare #SmileMakeover #DrNeemzDentistry"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Link URL (optional)</Label>
              <Input
                value={form.linkUrl}
                onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Schedule & Preview */}
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Clock size={16} /> Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.scheduleDate} onChange={e => setForm(f => ({ ...f, scheduleDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Time</Label>
                <Input type="time" value={form.scheduleTime} onChange={e => setForm(f => ({ ...f, scheduleTime: e.target.value }))} />
              </div>
              <div className="space-y-2 pt-2">
                <Button className="w-full gradient-primary border-0" disabled title="Scheduling is coming soon">
                  <Send size={14} className="mr-2" /> Schedule Post
                  <Badge variant="secondary" className="ml-2 text-[10px]">Coming soon</Badge>
                </Button>
                <Button variant="outline" className="w-full" onClick={handlePostNow} disabled={!!busy || uploading}>
                  {busy === "publish" ? (<><Loader2 size={14} className="mr-2 animate-spin" /> Publishing…</>) : "Post Now"}
                </Button>
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleDraft} disabled={!!busy}>
                  {busy === "draft" ? (<><Loader2 size={14} className="mr-2 animate-spin" /> Saving…</>) : "Save as Draft"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">Platform Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedPlatforms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Select platforms to see preview</p>
              ) : (
                <div className="space-y-2">
                  {selectedPlatforms.map(pid => {
                    const pl = platforms.find(p => p.id === pid)!;
                    return (
                      <div key={pid} className={`flex items-center gap-2 p-2.5 rounded-lg ${pl.bg}`}>
                        <pl.icon size={16} className={pl.color} />
                        <span className="text-xs font-medium">{pl.label}</span>
                        <Badge variant="outline" className="ml-auto text-[10px]">Ready</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PostCreator;
