import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export type AwarenessContentRow = {
  id: string;
  platform: string;
  content_format: string;
  title: string | null;
  caption: string | null;
  permalink: string | null;
  external_id: string | null;
  published_at: string;
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  enquiries: number | null;
  follower_gain: number | null;
  boost_spend: number | null;
  data_source: string;
  notes: string | null;
};

export const AWARENESS_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "youtube", label: "YouTube" },
  { value: "gmb", label: "Google Business Profile" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "quora", label: "Quora" },
  { value: "offline", label: "Offline" },
] as const;

export const AWARENESS_FORMATS = [
  { value: "post", label: "Static Post" },
  { value: "reel", label: "Reel" },
  { value: "short", label: "Short" },
  { value: "video", label: "Video" },
  { value: "carousel", label: "Carousel" },
  { value: "story", label: "Story" },
  { value: "gmb_update", label: "GMB Update" },
  { value: "article", label: "Article / Q&A" },
  { value: "activation", label: "Offline Activation" },
] as const;

const today = () => new Date().toISOString().slice(0, 10);

/** Manual entry for channels that do not return numbers automatically
 *  (LinkedIn, Quora, Google Business updates, offline activations), and for
 *  adding boost spend against any piece of content. */
export default function AwarenessEntryManager({
  editing,
  onOpenChange,
  onChanged,
}: {
  editing?: AwarenessContentRow | null;
  onOpenChange?: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!editing;
  const controlledOpen = isEdit ? true : open;

  const [platform, setPlatform] = useState(editing?.platform ?? "linkedin");
  const [format, setFormat] = useState(editing?.content_format ?? "post");
  const [title, setTitle] = useState(editing?.title ?? "");
  const [caption, setCaption] = useState(editing?.caption ?? "");
  const [permalink, setPermalink] = useState(editing?.permalink ?? "");
  const [publishedAt, setPublishedAt] = useState(editing?.published_at ?? today());
  const [reach, setReach] = useState(String(editing?.reach ?? ""));
  const [impressions, setImpressions] = useState(String(editing?.impressions ?? ""));
  const [likes, setLikes] = useState(String(editing?.likes ?? ""));
  const [comments, setComments] = useState(String(editing?.comments ?? ""));
  const [shares, setShares] = useState(String(editing?.shares ?? ""));
  const [enquiries, setEnquiries] = useState(String(editing?.enquiries ?? ""));
  const [followerGain, setFollowerGain] = useState(String(editing?.follower_gain ?? ""));
  const [boostSpend, setBoostSpend] = useState(String(editing?.boost_spend ?? ""));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const num = (v: string) => Math.max(0, Math.round(Number(v || 0)) || 0);

  const close = () => {
    if (isEdit) onOpenChange?.(false);
    else setOpen(false);
  };

  const save = async () => {
    if (!title.trim()) {
      toast.error("Add a title so the entry can be recognised");
      return;
    }
    setSaving(true);
    const payload = {
      platform,
      content_format: format,
      title: title.trim(),
      caption: caption.trim() || null,
      permalink: permalink.trim() || null,
      published_at: publishedAt,
      reach: num(reach),
      impressions: num(impressions) || num(reach),
      likes: num(likes),
      comments: num(comments),
      shares: num(shares),
      enquiries: num(enquiries),
      follower_gain: num(followerGain),
      boost_spend: Number(boostSpend || 0) || 0,
      notes: notes.trim() || null,
    };

    const { error } = editing
      ? await supabase.from("awareness_content").update(payload).eq("id", editing.id)
      : await supabase.from("awareness_content").insert({
          ...payload,
          data_source: "manual",
          created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        });

    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Entry updated" : "Entry added");
    close();
    onChanged();
  };

  const numberField = (label: string, value: string, set: (v: string) => void) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={0} value={value} onChange={(e) => set(e.target.value)} placeholder="0" />
    </div>
  );

  return (
    <Dialog
      open={controlledOpen}
      onOpenChange={(o) => {
        if (isEdit) onOpenChange?.(o);
        else setOpen(o);
      }}
    >
      {!isEdit && (
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Add entry
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit awareness entry" : "Add awareness entry"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Channel</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AWARENESS_PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AWARENESS_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Title / headline</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Implant awareness talk at Salem Rotary" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Caption / description</Label>
            <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Publish date</Label>
            <Input type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Link (optional)</Label>
            <Input value={permalink} onChange={(e) => setPermalink(e.target.value)} placeholder="https://" />
          </div>
          {numberField("Reach", reach, setReach)}
          {numberField("Impressions", impressions, setImpressions)}
          {numberField("Likes", likes, setLikes)}
          {numberField("Comments", comments, setComments)}
          {numberField("Shares", shares, setShares)}
          {numberField("Direct enquiries", enquiries, setEnquiries)}
          {numberField("Follower gain", followerGain, setFollowerGain)}
          <div className="space-y-1.5">
            <Label className="text-xs">Boost spend (₹)</Label>
            <Input type="number" min={0} step="0.01" value={boostSpend} onChange={(e) => setBoostSpend(e.target.value)} placeholder="0 = organic" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
