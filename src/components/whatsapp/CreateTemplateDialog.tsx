import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, ChevronsUpDown, ChevronDown, Upload, X, Phone, ExternalLink, Reply, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PresetButton = {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
  example?: string | string[];
};

type TemplateFormBase = {
  name: string;
  category: string;
  language: string;
  body: string;
  bodyExamples?: string[];
  headerFormat?: string;
  headerText?: string;
  headerExample?: string;
  footerText?: string;
  buttons?: PresetButton[];
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: TemplateFormBase;
  setForm: (updater: (f: TemplateFormBase) => TemplateFormBase) => void;
  onSubmit: () => void | Promise<void>;
  submitting?: boolean;
}


const CATEGORIES = [
  { value: "MARKETING", label: "Marketing", desc: "Promotions, offers, updates" },
  { value: "UTILITY", label: "Utility", desc: "Transactional, account updates" },
  { value: "AUTHENTICATION", label: "Authentication", desc: "OTP, verification codes" },
];

const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "bn", label: "Bengali" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt_BR", label: "Portuguese (BR)" },
  { code: "id", label: "Indonesian" },
  { code: "zh_CN", label: "Chinese (Simplified)" },
];

type HeaderType = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
type ButtonMode = "NONE" | "CTA" | "QUICK_REPLY";
type CtaButton = { subType: "PHONE_NUMBER" | "URL"; text: string; value: string; urlExample?: string };

const MAX_NAME = 60;
const MAX_HEADER = 60;
const MAX_FOOTER = 60;
const MAX_BODY = 1024;

function normalizeName(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, MAX_NAME);
}

export function CreateTemplateDialog({ open, onOpenChange, form, setForm, onSubmit, submitting }: Props) {
  const [headerType, setHeaderType] = useState<HeaderType>("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string>("");
  const [footerText, setFooterText] = useState("");
  const [buttonMode, setButtonMode] = useState<ButtonMode>("NONE");
  const [ctaButtons, setCtaButtons] = useState<CtaButton[]>([{ subType: "URL", text: "", value: "" }]);
  const [quickReplies, setQuickReplies] = useState<string[]>([""]);
  const [langOpen, setLangOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Hydrate internal state from `form` presets whenever the dialog opens.
  // Editing an existing template must pre-populate header/footer/CTA button
  // fields (including URL variables and example values) instead of clearing them.
  useEffect(() => {
    if (!open) return;
    const fmt = String(form.headerFormat || "NONE").toUpperCase();
    if (["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) {
      setHeaderType(fmt as HeaderType);
    } else {
      setHeaderType("NONE");
    }
    setHeaderText(form.headerText || "");
    setFooterText(form.footerText || "");

    const btns = Array.isArray(form.buttons) ? form.buttons : [];
    if (btns.length === 0) {
      setButtonMode("NONE");
      setCtaButtons([{ subType: "URL", text: "", value: "" }]);
      setQuickReplies([""]);
      return;
    }
    const firstType = String(btns[0]?.type || "").toUpperCase();
    if (firstType === "QUICK_REPLY") {
      setButtonMode("QUICK_REPLY");
      setQuickReplies(btns.map(b => String(b.text || "")).slice(0, 3));
      setCtaButtons([{ subType: "URL", text: "", value: "" }]);
    } else {
      setButtonMode("CTA");
      const mapped: CtaButton[] = btns
        .filter(b => {
          const t = String(b?.type || "").toUpperCase();
          return t === "URL" || t === "PHONE_NUMBER";
        })
        .map(b => {
          const t = String(b.type || "").toUpperCase() as "URL" | "PHONE_NUMBER";
          const ex = Array.isArray(b.example) ? b.example[0] : b.example;
          return {
            subType: t,
            text: String(b.text || ""),
            value: t === "URL" ? String(b.url || "") : String(b.phone_number || ""),
            urlExample: ex ? String(ex) : undefined,
          };
        });
      setCtaButtons(mapped.length ? mapped : [{ subType: "URL", text: "", value: "" }]);
      setQuickReplies([""]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const detectedVars = useMemo(() => {
    const set = new Set<string>();
    (form.body.match(/\{\{\s*\d+\s*\}\}/g) || []).forEach(v => set.add(v.replace(/\s+/g, "")));
    return Array.from(set).sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));
  }, [form.body]);

  const langLabel = LANGUAGES.find(l => l.code === form.language)?.label || form.language;

  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Template name is required";
  else if (!/^[a-z0-9_]+$/.test(form.name)) errors.name = "Only lowercase letters, numbers and underscore";
  if (!form.body.trim()) errors.body = "Body is required";
  if (headerType === "TEXT" && !headerText.trim()) errors.header = "Header text is required";
  if ((headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") && !headerFile) errors.header = "Please upload a file";
  detectedVars.forEach((v, i) => {
    const val = (form.bodyExamples?.[i] || "").trim();
    if (!val) errors[`example_${i}`] = `Sample for ${v} is required`;
    else if (/^(sample|test|example|placeholder)\s*\d*$/i.test(val))
      errors[`example_${i}`] = "Use a realistic value (not 'sample'/'test')";
  });
  if (buttonMode === "CTA") {
    ctaButtons.forEach((b, i) => {
      if (!b.text.trim()) errors[`cta_${i}`] = "Button text required";
      if (b.subType === "URL" && b.value && !/^https?:\/\//i.test(b.value)) errors[`cta_${i}`] = "Invalid URL";
      if (b.subType === "PHONE_NUMBER" && b.value && !/^\+?\d{6,}$/.test(b.value.replace(/\s/g, ""))) errors[`cta_${i}`] = "Invalid phone number";
      if (b.subType === "URL" && /\{\{\s*\d+\s*\}\}/.test(b.value) && !(b.urlExample || "").trim()) {
        errors[`cta_ex_${i}`] = "Sample value required for URL variable";
      }
    });
  }
  if (buttonMode === "QUICK_REPLY") {
    if (quickReplies.filter(q => q.trim()).length > 3) errors.qr = "Maximum 3 quick replies";
  }


  const err = (k: string) => (showErrors ? errors[k] : undefined);

  const onFile = (f: File | null) => {
    setHeaderFile(f);
    if (headerPreview) URL.revokeObjectURL(headerPreview);
    setHeaderPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : "");
  };

  const handleSubmit = async () => {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    await onSubmit();
    // reset extras on close
    setHeaderType("NONE"); setHeaderText(""); onFile(null); setFooterText("");
    setButtonMode("NONE"); setCtaButtons([{ subType: "URL", text: "", value: "" }]); setQuickReplies([""]);
    setShowErrors(false);
  };

  const accept =
    headerType === "IMAGE" ? "image/jpeg,image/jpg,image/png" :
    headerType === "VIDEO" ? "video/mp4,video/3gpp" :
    headerType === "DOCUMENT" ? "application/pdf" : "";

  const resolvedBody = form.body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => `{{${n}}}`);
  const resolvedHeader = headerText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="font-display">Create WhatsApp Template</DialogTitle>
        </DialogHeader>

        <div className="grid lg:grid-cols-[1fr_360px] gap-0 overflow-hidden flex-1">
          {/* Form */}
          <div className="overflow-y-auto px-6 py-4 space-y-5">
            <p className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
              Templates must be approved by Meta before use. Marketing templates require opt-in.
            </p>

            {/* Section 1: Info */}
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Template Information</div>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Template Name</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: normalizeName(e.target.value) }))}
                    placeholder="e.g. appointment_confirm"
                    maxLength={MAX_NAME}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className={cn(err("name") && "text-destructive")}>{err("name") || "Lowercase letters, numbers, underscore"}</span>
                    <span>{form.name.length}/{MAX_NAME}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Popover open={langOpen} onOpenChange={setLangOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {langLabel}
                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command>
                        <CommandInput placeholder="Search language..." />
                        <CommandList>
                          <CommandEmpty>No language found.</CommandEmpty>
                          <CommandGroup>
                            {LANGUAGES.map(l => (
                              <CommandItem
                                key={l.code}
                                value={`${l.label} ${l.code}`}
                                onSelect={() => { setForm(f => ({ ...f, language: l.code })); setLangOpen(false); }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", form.language === l.code ? "opacity-100" : "opacity-0")} />
                                {l.label} <span className="ml-auto text-xs text-muted-foreground">{l.code}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Category</Label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map(c => {
                    const active = form.category.toUpperCase() === c.value;
                    return (
                      <button
                        type="button"
                        key={c.value}
                        onClick={() => setForm(f => ({ ...f, category: c.value.toLowerCase() }))}
                        className={cn(
                          "rounded-lg border p-3 text-left transition-all hover:border-primary/50",
                          active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                        )}
                      >
                        <div className="text-sm font-medium">{c.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{c.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Section 2: Header */}
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Header (optional)</div>
              <div className="space-y-1.5">
                <Label>Header Type</Label>
                <Select value={headerType} onValueChange={v => { setHeaderType(v as HeaderType); onFile(null); setHeaderText(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Header</SelectItem>
                    <SelectItem value="TEXT">Text</SelectItem>
                    <SelectItem value="IMAGE">Image</SelectItem>
                    <SelectItem value="VIDEO">Video</SelectItem>
                    <SelectItem value="DOCUMENT">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {headerType === "TEXT" && (
                <div className="space-y-1.5">
                  <Label>Header Text</Label>
                  <Input value={headerText} onChange={e => setHeaderText(e.target.value.slice(0, MAX_HEADER))} placeholder="e.g. Appointment Confirmed" />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className={cn(err("header") && "text-destructive")}>{err("header") || " "}</span>
                    <span>{headerText.length}/{MAX_HEADER}</span>
                  </div>
                </div>
              )}

              {(headerType === "IMAGE" || headerType === "VIDEO" || headerType === "DOCUMENT") && (
                <div className="space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={e => onFile(e.target.files?.[0] || null)}
                  />
                  {!headerFile ? (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-full rounded-lg border-2 border-dashed border-border hover:border-primary/50 p-6 text-center transition-colors"
                    >
                      <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
                      <div className="text-sm">Click to upload {headerType.toLowerCase()}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {headerType === "IMAGE" && "JPG, JPEG, PNG"}
                        {headerType === "VIDEO" && "MP4, 3GPP"}
                        {headerType === "DOCUMENT" && "PDF"}
                      </div>
                    </button>
                  ) : (
                    <div className="rounded-lg border p-3 flex items-center gap-3">
                      {headerPreview ? (
                        <img src={headerPreview} alt="preview" className="h-16 w-16 object-cover rounded" />
                      ) : (
                        <div className="h-16 w-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          {headerType === "VIDEO" ? "🎬" : "📄"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{headerFile.name}</div>
                        <div className="text-[10px] text-muted-foreground">{(headerFile.size / 1024).toFixed(1)} KB</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => onFile(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {err("header") && <p className="text-[10px] text-destructive">{err("header")}</p>}
                </div>
              )}
            </section>

            {/* Section 3: Body */}
            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message Body</div>
              <Textarea
                rows={5}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value.slice(0, MAX_BODY) }))}
                placeholder="Use {{1}}, {{2}}, {{3}} for variables"
              />
              <div className="flex justify-between text-[10px]">
                <span className={cn("text-muted-foreground", err("body") && "text-destructive")}>{err("body") || "Variables will be replaced while sending."}</span>
                <span className="text-muted-foreground">{form.body.length}/{MAX_BODY}</span>
              </div>
              {detectedVars.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">Detected Variables:</span>
                  {detectedVars.map(v => <Badge key={v} variant="secondary" className="text-[10px]">{v}</Badge>)}
                </div>
              )}
            </section>

            {/* Section 3b: Sample Values for variables */}
            {detectedVars.length > 0 && (
              <section className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample Values for Variables</div>
                <p className="text-[10px] text-muted-foreground">
                  Meta uses these to validate your template. Use realistic values (e.g. "Rahul", "10:30 AM") — not "test" or "sample".
                </p>
                <div className="grid md:grid-cols-2 gap-2">
                  {detectedVars.map((v, i) => (
                    <div key={v} className="space-y-1">
                      <Label className="text-[11px]">{v}</Label>
                      <Input
                        value={form.bodyExamples?.[i] || ""}
                        onChange={e => setForm(f => {
                          const next = [...(f.bodyExamples || [])];
                          while (next.length < detectedVars.length) next.push("");
                          next[i] = e.target.value;
                          return { ...f, bodyExamples: next.slice(0, detectedVars.length) };
                        })}
                        placeholder={`Example value for ${v}`}
                      />
                      {err(`example_${i}`) && <p className="text-[10px] text-destructive">{err(`example_${i}`)}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}


            {/* Section 4: Footer */}
            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Footer (optional)</div>
              <Input value={footerText} onChange={e => setFooterText(e.target.value.slice(0, MAX_FOOTER))} placeholder="e.g. Reply STOP to opt out" />
              <div className="flex justify-end text-[10px] text-muted-foreground">{footerText.length}/{MAX_FOOTER}</div>
            </section>

            {/* Section 5: Buttons */}
            <section className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buttons (optional)</div>
              <div className="inline-flex rounded-lg border p-1 bg-muted/40">
                {(["NONE", "CTA", "QUICK_REPLY"] as ButtonMode[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setButtonMode(m)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-md transition-colors",
                      buttonMode === m ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "NONE" ? "None" : m === "CTA" ? "Call to Action" : "Quick Reply"}
                  </button>
                ))}
              </div>

              {buttonMode === "CTA" && (
                <div className="space-y-2">
                  {ctaButtons.map((b, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium">Button {i + 1}</div>
                        {ctaButtons.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => setCtaButtons(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Select value={b.subType} onValueChange={v => setCtaButtons(prev => prev.map((p, j) => j === i ? { ...p, subType: v as CtaButton["subType"] } : p))}>
                          <SelectTrigger className="col-span-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PHONE_NUMBER">Phone</SelectItem>
                            <SelectItem value="URL">Website URL</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input placeholder="Button text" value={b.text} maxLength={25}
                          onChange={e => setCtaButtons(prev => prev.map((p, j) => j === i ? { ...p, text: e.target.value } : p))} />
                        <Input placeholder={b.subType === "URL" ? "https://..." : "+911234567890"} value={b.value}
                          onChange={e => setCtaButtons(prev => prev.map((p, j) => j === i ? { ...p, value: e.target.value } : p))} />
                      </div>
                      {err(`cta_${i}`) && <p className="text-[10px] text-destructive">{err(`cta_${i}`)}</p>}
                      {b.subType === "URL" && /\{\{\s*\d+\s*\}\}/.test(b.value) && (
                        <div className="space-y-1 pt-1 border-t">
                          <Label className="text-[11px]">Sample value for URL variable</Label>
                          <Input
                            placeholder="e.g. invoices/sample_invoice.pdf"
                            value={b.urlExample || ""}
                            onChange={e => setCtaButtons(prev => prev.map((p, j) => j === i ? { ...p, urlExample: e.target.value } : p))}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Meta requires a realistic example for the {"{{1}}"} in your URL (not "test" / "sample").
                          </p>
                          {err(`cta_ex_${i}`) && <p className="text-[10px] text-destructive">{err(`cta_ex_${i}`)}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                  {ctaButtons.length < 4 && (
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setCtaButtons(prev => [...prev, { subType: "URL", text: "", value: "" }])}>
                      + Add CTA button ({ctaButtons.length}/4)
                    </Button>
                  )}
                </div>
              )}

              {buttonMode === "QUICK_REPLY" && (
                <div className="space-y-2">
                  {quickReplies.map((q, i) => (
                    <div key={i} className="flex gap-2">
                      <Input placeholder={`Quick reply ${i + 1}`} value={q} maxLength={25}
                        onChange={e => setQuickReplies(prev => prev.map((p, j) => j === i ? e.target.value : p))} />
                      {quickReplies.length > 1 && (
                        <Button type="button" variant="ghost" size="icon"
                          onClick={() => setQuickReplies(prev => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                      )}
                    </div>
                  ))}
                  {quickReplies.length < 3 && (
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => setQuickReplies(prev => [...prev, ""])}>
                      + Add quick reply
                    </Button>
                  )}
                  {err("qr") && <p className="text-[10px] text-destructive">{err("qr")}</p>}
                </div>
              )}
            </section>

            {/* Section 8: Help */}
            <Collapsible className="rounded-lg border">
              <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-sm font-medium hover:bg-muted/40 rounded-lg">
                Why templates get rejected
                <ChevronDown className="h-4 w-4 transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-3 text-xs text-muted-foreground space-y-1">
                <div>• Invalid or non-sequential variables ({"{{1}}, {{2}}"} without content)</div>
                <div>• Promotional or spam-like language</div>
                <div>• Missing parameter examples for Meta review</div>
                <div>• Unsupported content (URLs, emojis in header, etc.)</div>
                <div>• Wrong category (marketing content in Utility)</div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Preview */}
          <div className="hidden lg:block border-l bg-muted/30 p-4 overflow-y-auto">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Live Preview</div>
            <div className="rounded-2xl bg-[#e5ddd5] p-3 shadow-inner">
              <div className="relative max-w-full">
                <div className="rounded-lg rounded-tl-none bg-white p-2 shadow-sm">
                  {headerType === "TEXT" && resolvedHeader && (
                    <div className="mb-1 px-1 text-sm font-semibold">{resolvedHeader}</div>
                  )}
                  {headerType === "IMAGE" && (
                    <div className="mb-2 aspect-[16/9] w-full overflow-hidden rounded-md bg-muted flex items-center justify-center">
                      {headerPreview
                        ? <img src={headerPreview} alt="header" className="h-full w-full object-cover" />
                        : <ImageIcon className="text-muted-foreground" size={28} />}
                    </div>
                  )}
                  {headerType === "VIDEO" && (
                    <div className="mb-2 aspect-video rounded-md bg-black/80 text-white text-xs flex items-center justify-center">Video header</div>
                  )}
                  {headerType === "DOCUMENT" && (
                    <div className="mb-2 rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground">📄 {headerFile?.name || "Document"}</div>
                  )}

                  <div className="whitespace-pre-wrap break-words px-1 text-sm">
                    {resolvedBody || <span className="text-muted-foreground">Your message body...</span>}
                  </div>

                  {footerText && <div className="mt-1 px-1 text-[11px] text-muted-foreground">{footerText}</div>}

                  <div className="mt-1 flex justify-end px-1 text-[10px] text-muted-foreground">
                    {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <span className="absolute -left-1.5 top-0 h-3 w-3 rotate-45 bg-white" aria-hidden />
                </div>

                {buttonMode === "CTA" && ctaButtons.filter(b => b.text.trim()).length > 0 && (
                  <div className="mt-1 space-y-1">
                    {ctaButtons.filter(b => b.text.trim()).map((b, i) => (
                      <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-medium text-[#00a5f4] shadow-sm">
                        {b.subType === "PHONE_NUMBER" ? <Phone size={14} /> : <ExternalLink size={14} />}
                        {b.text}
                      </div>
                    ))}
                  </div>
                )}
                {buttonMode === "QUICK_REPLY" && quickReplies.filter(q => q.trim()).length > 0 && (
                  <div className="mt-1 space-y-1">
                    {quickReplies.filter(q => q.trim()).map((q, i) => (
                      <div key={i} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-medium text-[#00a5f4] shadow-sm">
                        <Reply size={14} /> {q}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">Preview updates as you type. Meta's rendering may differ slightly.</p>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit for Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateTemplateDialog;
