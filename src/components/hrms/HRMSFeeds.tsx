import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Paperclip, Settings, X, Users, ChevronDown } from "lucide-react";

interface Post {
  id: string;
  text: string;
  createdAt: Date;
  visibility: "all" | "some";
  disableComments: boolean;
  moderation: boolean;
}

interface Props {
  kind: "feeds" | "announcements";
}

export default function HRMSFeeds({ kind }: Props) {
  const [text, setText] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [visibility, setVisibility] = useState<"all" | "some">("all");
  const [disableComments, setDisableComments] = useState(false);
  const [moderation, setModeration] = useState(false);

  const [visOpen, setVisOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);

  // draft state for modals so CANCEL discards
  const [draftVis, setDraftVis] = useState<"all" | "some">("all");
  const [draftDisable, setDraftDisable] = useState(false);
  const [draftModeration, setDraftModeration] = useState(false);

  const openVis = () => { setDraftVis(visibility); setVisOpen(true); };
  const openSettings = () => { setDraftDisable(disableComments); setDraftModeration(moderation); setSetOpen(true); };

  const post = () => {
    if (!text.trim()) return;
    setPosts(p => [
      { id: crypto.randomUUID(), text: text.trim(), createdAt: new Date(), visibility, disableComments, moderation },
      ...p,
    ]);
    setText("");
  };

  return (
    <div className="space-y-4">
      {/* Composer */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="relative">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={kind === "feeds" ? "Write something to your team…" : "Write an announcement…"}
              className="min-h-[90px] resize-none bg-background pr-10"
            />
            <button
              type="button"
              onClick={openSettings}
              aria-label="Post settings"
              className="absolute right-2 top-2 p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              aria-label="Attach file"
              className="p-2 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={openVis}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              <Users className="h-4 w-4" />
              Post visibility settings
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            <Button size="sm" disabled={!text.trim()} onClick={post} className="tracking-wide">
              POST
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Posts / empty state */}
      {posts.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No posts yet!!</p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-2">
                <p className="whitespace-pre-wrap text-sm">{p.text}</p>
                <p className="text-xs text-muted-foreground">
                  {p.createdAt.toLocaleString()} • {p.visibility === "all" ? "All employees" : "Selected employees"}
                  {p.disableComments ? " • Comments disabled" : ""}
                  {p.moderation ? " • Moderated" : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Visibility modal */}
      <Dialog open={visOpen} onOpenChange={setVisOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent className="p-0 gap-0 overflow-hidden sm:max-w-md [&>button]:hidden">
            <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
              <h2 className="font-semibold">Post visibility settings</h2>
              <button type="button" onClick={() => setVisOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <RadioGroup value={draftVis} onValueChange={(v) => setDraftVis(v as "all" | "some")} className="space-y-3">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="all" id="vis-all" />
                  <Label htmlFor="vis-all">Show for all employees</Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="some" id="vis-some" />
                  <Label htmlFor="vis-some">Only for some employees</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button variant="secondary" size="sm" onClick={() => { setVisibility(draftVis); setVisOpen(false); }}>SAVE</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setVisOpen(false)}>CANCEL</Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Post settings modal */}
      <Dialog open={setOpen} onOpenChange={setSetOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogContent className="p-0 gap-0 overflow-hidden sm:max-w-md [&>button]:hidden">
            <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
              <h2 className="font-semibold">Post settings</h2>
              <button type="button" onClick={() => setSetOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Disable comments</p>
                  <p className="text-xs text-muted-foreground">Employees will not be able to comment on this post.</p>
                </div>
                <Switch checked={draftDisable} onCheckedChange={setDraftDisable} />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">Moderation required before comment appear</p>
                  <p className="text-xs text-muted-foreground">Comments will be visible only after an admin approves them.</p>
                </div>
                <Switch checked={draftModeration} onCheckedChange={setDraftModeration} />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button variant="secondary" size="sm" onClick={() => { setDisableComments(draftDisable); setModeration(draftModeration); setSetOpen(false); }}>SAVE</Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setSetOpen(false)}>CANCEL</Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
