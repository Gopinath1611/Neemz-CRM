import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeft, Link2, Loader2, PackageSearch, ShieldAlert, Info } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type InventoryItem = {
  id: string;
  name: string;
  quantity: number | null;
  cost_price: number | null;
  unit: string | null;
  is_active: boolean | null;
  category_id: string | null;
};

type MedicineRow = {
  id: string;
  name: string;
  inventory_item_id: string | null;
};

type Decision =
  | { kind: "unmapped" }
  | { kind: "mapped"; itemId: string }
  | { kind: "no_item" }
  | { kind: "review" };

type UnmatchedRow = {
  norm: string;
  displayName: string;
  occurrences: number;
  units: number;
  medicine: MedicineRow | null;
  candidates: Candidate[];
};

type Candidate = {
  item: InventoryItem;
  reason: string;
  confidence: "MEDIUM" | "LOW";
};

/* ------------------------------------------------------------------ */
/* Normalisation + candidate discovery (display only, never auto-map) */
/* ------------------------------------------------------------------ */

const normalize = (s: string) =>
  (s || "")
    .split(" (")[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Loose key used only to *find* candidates for a human to review. */
const looseKey = (s: string) =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokens = (s: string) =>
  looseKey(s)
    .split(" ")
    .filter((t) => t.length > 1);

/** Names that must always require explicit confirmation, per audit. */
const ALWAYS_CONFIRM = [
  "mox - cv",
  "moxiclav syrup",
  "metro 400 mg",
  "keterol dt",
  "wysolone",
  "mcdol p",
];

const STRENGTH_RE = /(\d+(?:\.\d+)?)\s*(mg|ml|mcg|gm|g|%)/gi;
const FORM_WORDS = ["syrup", "suspension", "tab", "tablet", "dt", "er", "sp", "paste", "gel", "cream", "capsule", "drops", "oral"];

const strengthsOf = (s: string) => {
  const out: string[] = [];
  const re = new RegExp(STRENGTH_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(`${m[1]}${m[2].toLowerCase()}`);
  return out;
};

const formsOf = (s: string) => {
  const t = tokens(s);
  return FORM_WORDS.filter((f) => t.includes(f));
};

const describeItem = (item: InventoryItem) => {
  const bits = [...strengthsOf(item.name), ...formsOf(item.name)];
  return bits.length ? bits.join(" · ") : "no strength/form in name";
};

function buildCandidates(billedName: string, items: InventoryItem[], medicines: MedicineRow[]): Candidate[] {
  const bTokens = tokens(billedName);
  if (!bTokens.length) return [];
  const bStrengths = strengthsOf(billedName);
  const seen = new Set<string>();
  const out: Candidate[] = [];

  const push = (item: InventoryItem, reason: string, confidence: "MEDIUM" | "LOW") => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push({ item, reason, confidence });
  };

  // Items already referenced by a medicine whose name shares tokens with the billed name.
  for (const med of medicines) {
    if (!med.inventory_item_id) continue;
    const mTokens = tokens(med.name);
    const overlap = bTokens.filter((t) => mTokens.includes(t));
    if (overlap.length >= Math.min(2, bTokens.length)) {
      const item = items.find((i) => i.id === med.inventory_item_id);
      if (item) push(item, `Existing medicine "${med.name.trim()}" already links here`, "MEDIUM");
    }
  }

  // Direct token overlap against inventory item names.
  for (const item of items) {
    const iTokens = tokens(item.name);
    const overlap = bTokens.filter((t) => iTokens.includes(t));
    if (!overlap.length) continue;
    const strong = overlap.length >= Math.min(2, bTokens.length);
    const iStrengths = strengthsOf(item.name);
    const strengthMatch =
      bStrengths.length > 0 && iStrengths.length > 0 && bStrengths.some((s) => iStrengths.includes(s));
    const strengthConflict =
      bStrengths.length > 0 && iStrengths.length > 0 && !strengthMatch;

    if (strong && strengthMatch) {
      push(item, `Shares "${overlap.join(", ")}" and strength ${bStrengths.join("/")}`, "MEDIUM");
    } else if (strong && !strengthConflict) {
      push(item, `Shares "${overlap.join(", ")}" — strength not stated on both sides`, "LOW");
    } else if (strong && strengthConflict) {
      push(item, `Shares "${overlap.join(", ")}" but strength differs (${iStrengths.join("/")} vs ${bStrengths.join("/")})`, "LOW");
    } else if (overlap.length === 1 && bTokens.length === 1) {
      push(item, `Partial name overlap on "${overlap[0]}"`, "LOW");
    }
  }

  // Spelling-variant candidates (e.g. "Keterol DT" vs "Ketorol-dt", "Moxiclav Syrup" vs "Mox Clav Syrup").
  const bCollapsed = looseKey(billedName).replace(/\s/g, "");
  for (const item of items) {
    if (seen.has(item.id)) continue;
    const iCollapsed = looseKey(item.name).replace(/\s/g, "");
    if (!iCollapsed) continue;
    const wholeDist = levenshtein(bCollapsed, iCollapsed);
    const tolerance = Math.max(1, Math.floor(Math.max(bCollapsed.length, iCollapsed.length) * 0.15));
    if (wholeDist <= tolerance) {
      push(item, `Near-identical spelling (edit distance ${wholeDist})`, "LOW");
      continue;
    }
    // Word-level near match on a distinctive token (brand-name typos).
    const iTokens = tokens(item.name);
    for (const bt of bTokens) {
      if (bt.length < 5) continue;
      const near = iTokens.find((it) => it.length >= 5 && levenshtein(bt, it) <= Math.max(1, Math.floor(bt.length * 0.2)));
      if (near) {
        push(item, `Brand token "${bt}" closely matches "${near}"`, "LOW");
        break;
      }
    }
  }

  return out;
}

/** Small Levenshtein for spotting spelling variants — comparison only, never auto-mapping. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}


/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function MedicineInventoryMapping({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [rows, setRows] = useState<UnmatchedRow[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [activeNorm, setActiveNorm] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, medRes] = await Promise.all([
        supabase.from("inventory_items").select("id, name, quantity, cost_price, unit, is_active, category_id"),
        supabase.from("medicines").select("id, name, inventory_item_id"),
      ]);
      const inv = (invRes.data || []) as InventoryItem[];
      const meds = (medRes.data || []) as MedicineRow[];

      // Paid medicine billing lines (paged so nothing is silently truncated).
      const lines: { description: string | null; quantity: number | null }[] = [];
      const PAGE = 1000;
      for (let page = 0; page < 20; page++) {
        const { data, error } = await supabase
          .from("billing_items")
          .select("description, quantity, billings!inner(payment_status)")
          .eq("treatment_type", "Medicine")
          .eq("billings.payment_status", "paid")
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        const batch = (data || []) as any[];
        lines.push(...batch.map((r) => ({ description: r.description, quantity: r.quantity })));
        if (batch.length < PAGE) break;
      }

      const medByNorm = new Map<string, MedicineRow>();
      for (const m of meds) if (!medByNorm.has(normalize(m.name))) medByNorm.set(normalize(m.name), m);
      const activeItemByNorm = new Map<string, InventoryItem>();
      for (const i of inv) {
        if (i.is_active === false) continue;
        const k = normalize(i.name);
        if (!activeItemByNorm.has(k)) activeItemByNorm.set(k, i);
      }

      const agg = new Map<string, UnmatchedRow>();
      for (const line of lines) {
        const norm = normalize(line.description || "");
        if (!norm) continue;
        const med = medByNorm.get(norm) || null;
        const resolved = med?.inventory_item_id || activeItemByNorm.get(norm)?.id || null;
        if (resolved) continue; // already deducting — nothing to map
        const existing = agg.get(norm);
        const qty = Number(line.quantity) || 0;
        if (existing) {
          existing.occurrences += 1;
          existing.units += qty;
        } else {
          agg.set(norm, {
            norm,
            displayName: (line.description || "").split(" (")[0],
            occurrences: 1,
            units: qty,
            medicine: med,
            candidates: buildCandidates(norm, inv, meds),
          });
        }
      }

      setItems(inv);
      setMedicines(meds);
      setRows(Array.from(agg.values()).sort((a, b) => b.units - a.units));
    } catch (e: any) {
      toast.error(e?.message || "Could not load mapping data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setActiveNorm(null);
      setChoice("");
      setConfirming(false);
      load();
    }
  }, [open, load]);

  const active = useMemo(() => rows.find((r) => r.norm === activeNorm) || null, [rows, activeNorm]);
  const totals = useMemo(
    () => ({
      names: rows.length,
      lines: rows.reduce((s, r) => s + r.occurrences, 0),
      units: rows.reduce((s, r) => s + r.units, 0),
    }),
    [rows]
  );

  const statusOf = (norm: string): Decision => decisions[norm] || { kind: "unmapped" };

  const openReview = (row: UnmatchedRow) => {
    setActiveNorm(row.norm);
    const d = statusOf(row.norm);
    setChoice(d.kind === "mapped" ? `item:${d.itemId}` : d.kind === "no_item" ? "no_item" : d.kind === "review" ? "review" : "");
    setConfirming(false);
  };

  const selectedItem = choice.startsWith("item:") ? items.find((i) => i.id === choice.slice(5)) || null : null;
  const alreadyLinkedMedicine = selectedItem
    ? medicines.find((m) => m.inventory_item_id === selectedItem.id && m.id !== active?.medicine?.id) || null
    : null;

  const applyDecision = async () => {
    if (!active) return;
    if (choice === "no_item") {
      setDecisions((p) => ({ ...p, [active.norm]: { kind: "no_item" } }));
      toast.success("Marked as “no matching inventory item” (nothing was changed in the database)");
      setActiveNorm(null);
      return;
    }
    if (choice === "review") {
      setDecisions((p) => ({ ...p, [active.norm]: { kind: "review" } }));
      toast.success("Parked for manual review (nothing was changed in the database)");
      setActiveNorm(null);
      return;
    }
    if (!selectedItem) return;

    setSaving(true);
    try {
      if (active.medicine) {
        const { error } = await supabase
          .from("medicines")
          .update({ inventory_item_id: selectedItem.id })
          .eq("id", active.medicine.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("medicines").insert({
          name: active.displayName.trim() || active.norm,
          inventory_item_id: selectedItem.id,
          unit: selectedItem.unit || "tablet",
          unit_cost: Number(selectedItem.cost_price) || 0,
        });
        if (error) throw error;
      }
      setDecisions((p) => ({ ...p, [active.norm]: { kind: "mapped", itemId: selectedItem.id } }));
      toast.success(`Mapped “${active.displayName.trim()}” → ${selectedItem.name}. Future paid bills will deduct stock.`);
      setActiveNorm(null);
      setConfirming(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not save mapping");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */

  const renderStatusBadge = (norm: string) => {
    const d = statusOf(norm);
    if (d.kind === "mapped")
      return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">Mapped</Badge>;
    if (d.kind === "no_item") return <Badge variant="secondary">No inventory item</Badge>;
    if (d.kind === "review") return <Badge variant="secondary">Needs review</Badge>;
    return <Badge variant="outline">Unmapped</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Medicine → Inventory Mapping
          </DialogTitle>
          <DialogDescription>
            Explicitly map billed medicine names to existing inventory items. Mapping affects <strong>future bills only</strong> —
            no historical stock is adjusted here.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading mapping data…
          </div>
        ) : active ? (
          /* ---------------- Review panel ---------------- */
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setActiveNorm(null)} className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
            </Button>

            <Card>
              <CardContent className="p-4 grid gap-3 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Billed name (verbatim)</p>
                  <p className="font-mono font-medium">“{active.displayName}”</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Occurrences / Units</p>
                  <p className="font-medium">
                    {active.occurrences} lines · {active.units} units
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Existing medicine record</p>
                  <p className="font-medium">{active.medicine ? `“${active.medicine.name}”` : "— none —"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Current inventory link</p>
                  <p className="font-medium">{active.medicine?.inventory_item_id ? "linked" : "NULL"}</p>
                </div>
              </CardContent>
            </Card>

            {ALWAYS_CONFIRM.includes(active.norm) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <ShieldAlert className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <span>
                  This name was flagged in the audit as <strong>confirmation required</strong>. Strength, formulation, brand or pack
                  size may differ — verify against the physical product before mapping.
                </span>
              </div>
            )}

            {active.candidates.length > 1 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <span>
                  <strong>{active.candidates.length} possible inventory items.</strong> Conflicting variants:{" "}
                  {active.candidates.map((c) => `${c.item.name} (${describeItem(c.item)})`).join(" · ")}. Nothing is preselected —
                  choose only if you are certain it is the same item.
                </span>
              </div>
            )}

            <RadioGroup value={choice} onValueChange={(v) => { setChoice(v); setConfirming(false); }} className="space-y-2">
              {active.candidates.length === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4" /> No inventory item resembles this name.
                </div>
              )}
              {active.candidates.map((c) => (
                <label
                  key={c.item.id}
                  htmlFor={`cand-${c.item.id}`}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                    choice === `item:${c.item.id}` ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value={`item:${c.item.id}`} id={`cand-${c.item.id}`} className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.item.name}</span>
                      <Badge variant="outline" className="text-[10px]">{c.confidence}</Badge>
                      {c.item.is_active === false && (
                        <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15 text-[10px]">
                          Inactive — will not deduct
                        </Badge>
                      )}
                      {(Number(c.item.quantity) || 0) === 0 && (
                        <Badge variant="secondary" className="text-[10px]">Zero stock — possibly stale</Badge>
                      )}
                      {(Number(c.item.cost_price) || 0) === 0 && (
                        <Badge variant="secondary" className="text-[10px]">No cost price</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Stock: {Number(c.item.quantity) || 0} {c.item.unit || ""} · Unit cost: ₹{Number(c.item.cost_price) || 0} ·{" "}
                      {describeItem(c.item)}
                    </p>
                    <p className="text-xs text-muted-foreground">{c.reason}</p>
                  </div>
                </label>
              ))}

              <label
                htmlFor="opt-no-item"
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 cursor-pointer",
                  choice === "no_item" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <RadioGroupItem value="no_item" id="opt-no-item" />
                <div>
                  <p className="text-sm font-medium">No matching inventory item</p>
                  <p className="text-xs text-muted-foreground">Records the decision only — no data is written.</p>
                </div>
              </label>

              <label
                htmlFor="opt-review"
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 cursor-pointer",
                  choice === "review" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <RadioGroupItem value="review" id="opt-review" />
                <div>
                  <p className="text-sm font-medium">Needs manual review</p>
                  <p className="text-xs text-muted-foreground">Park this name for later — no data is written.</p>
                </div>
              </label>
            </RadioGroup>

            {selectedItem && alreadyLinkedMedicine && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <span>
                  “{alreadyLinkedMedicine.name.trim()}” already links to this inventory item. Two medicines will share one item and
                  both will deduct from the same stock.
                </span>
              </div>
            )}

            {confirming && selectedItem ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
                <p className="text-sm">
                  Confirm mapping: <strong>“{active.displayName.trim()}”</strong> → <strong>{selectedItem.name}</strong> (
                  {describeItem(selectedItem)}, stock {Number(selectedItem.quantity) || 0}, ₹
                  {Number(selectedItem.cost_price) || 0})
                </p>
                <p className="text-xs text-muted-foreground">
                  This writes only <code>medicines.inventory_item_id</code>
                  {active.medicine ? "" : " (creating the missing medicine record)"}. No stock quantities, no stock-out rows, no
                  historical corrections.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={applyDecision} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    I confirm this is the same item
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!choice}
                  onClick={() => (selectedItem ? setConfirming(true) : applyDecision())}
                >
                  {selectedItem ? "Continue" : "Save decision"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveNorm(null)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* ---------------- List ---------------- */
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Unmatched medicine names", value: totals.names },
                { label: "Unmatched paid lines", value: totals.lines },
                { label: "Unmatched units", value: totals.units.toLocaleString("en-IN") },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <PackageSearch className="h-8 w-8 mb-2" />
                <p>Every paid medicine line resolves to an inventory item.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Billed medicine name</TableHead>
                      <TableHead className="text-right">Occurrences</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead>Medicine record</TableHead>
                      <TableHead>Current link</TableHead>
                      <TableHead>Candidates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.norm}>
                        <TableCell className="font-mono text-xs">“{r.displayName}”</TableCell>
                        <TableCell className="text-right">{r.occurrences}</TableCell>
                        <TableCell className="text-right font-medium">{r.units}</TableCell>
                        <TableCell className="text-xs">{r.medicine ? r.medicine.name : "—"}</TableCell>
                        <TableCell className="text-xs">{r.medicine?.inventory_item_id ? "linked" : "NULL"}</TableCell>
                        <TableCell className="text-xs">
                          {r.candidates.length === 0 ? (
                            <span className="text-muted-foreground">none</span>
                          ) : (
                            <span className={cn("flex items-center gap-1", r.candidates.length > 1 && "text-amber-600")}>
                              {r.candidates.length} possible
                              {r.candidates.length > 1 && <AlertTriangle className="h-3.5 w-3.5" />}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{renderStatusBadge(r.norm)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Historical unmatched sales stay untouched: {totals.units.toLocaleString("en-IN")} previously undeducted units are not
              adjusted by this screen. A separate approved backfill step will decide how they are handled.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
