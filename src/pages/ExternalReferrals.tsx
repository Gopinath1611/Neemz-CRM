import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FlaskConical, Search, Upload, FileText, ExternalLink, Eye, IndianRupee, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import AddExternalReferralDialog from "@/components/referrals/AddExternalReferralDialog";

interface OrderRow {
  id: string;
  patient_id: string;
  category: "scan_center" | "blood_test" | string;
  scan_center: string | null;
  blood_lab: string | null;
  tests: string[] | null;
  notes: string | null;
  doctor: string | null;
  status: string | null;
  cost: number | null;
  report_url: string | null;
  report_sizes: number[] | null;
  report_received_at: string | null;
  sample_collected_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  patient?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    patient_code: string | null;
  } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  scan_center: "Scan Center",
  blood_test: "Blood Test",
};

const STATUS_OPTIONS = [
  { value: "ordered", label: "Ordered" },
  { value: "sample_collected", label: "Sample Collected" },
  { value: "report_received", label: "Report Received" },
  { value: "reviewed", label: "Reviewed" },
  { value: "cancelled", label: "Cancelled" },
];

const statusVariant = (s: string | null) => {
  switch (s) {
    case "reviewed": return "default" as const;
    case "report_received": return "secondary" as const;
    case "cancelled": return "destructive" as const;
    default: return "outline" as const;
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

const toText = (value: unknown): string => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  return String(value);
};

export default function ExternalReferrals() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const dateFilter = useDateRangeFilter("today");
  const { doctorOptions } = useClinicMasters();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("diagnostic_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load referrals", description: error.message, variant: "destructive" });
      setOrders([]);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as any[];
    const patientIds = Array.from(new Set(rows.map((r) => r.patient_id).filter(Boolean)));
    let patientMap: Record<string, any> = {};
    if (patientIds.length > 0) {
      const { data: pts } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, patient_code")
        .in("id", patientIds);
      (pts ?? []).forEach((p: any) => { patientMap[p.id] = p; });
    }
    setOrders(rows.map((r) => ({ ...r, patient: patientMap[r.patient_id] || null })) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const dateScoped = useMemo(() => {
    const { from, to } = dateFilter.range;
    if (!from && !to) return orders;
    return orders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    });
  }, [orders, dateFilter.range]);

  const partnerOptions = useMemo(() => {
    const set = new Set<string>();
    dateScoped.forEach((o) => {
      if (categoryFilter !== "all" && o.category !== categoryFilter) return;
      const p = toText(o.scan_center || o.blood_lab).trim();
      if (p) set.add(p);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dateScoped, categoryFilter]);

  useEffect(() => {
    if (partnerFilter !== "all" && !partnerOptions.includes(partnerFilter)) {
      setPartnerFilter("all");
    }
  }, [partnerOptions, partnerFilter]);

  const filtered = useMemo(() => {
    return dateScoped.filter((o) => {
      if (categoryFilter !== "all" && o.category !== categoryFilter) return false;
      if (statusFilter !== "all" && (o.status ?? "ordered") !== statusFilter) return false;
      if (partnerFilter !== "all") {
        const partner = toText(o.scan_center || o.blood_lab).trim();
        if (partner !== partnerFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = `${toText(o.patient?.first_name)} ${toText(o.patient?.last_name)}`.toLowerCase();
        const partner = toText(o.scan_center || o.blood_lab).toLowerCase();
        const tests = toText(o.tests).toLowerCase();
        const code = toText(o.patient?.patient_code).toLowerCase();
        if (!name.includes(q) && !partner.includes(q) && !tests.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
  }, [dateScoped, search, categoryFilter, statusFilter, partnerFilter]);

  const pagedFiltered = usePagedSlice(filtered, page, pageSize);

  const stats = useMemo(() => {
    const total = dateScoped.length;
    const scan = dateScoped.filter((o) => o.category === "scan_center").length;
    const blood = dateScoped.filter((o) => o.category === "blood_test").length;
    const pending = dateScoped.filter((o) => !o.status || ["ordered", "sample_collected"].includes(o.status)).length;
    const totalCost = dateScoped.reduce((s, o) => s + Number(o.cost || 0), 0);
    return { total, scan, blood, pending, totalCost };
  }, [dateScoped]);

  const partnerBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; category: string; count: number; pending: number; cost: number }>();
    dateScoped.forEach((o) => {
      const partner = toText(o.scan_center || o.blood_lab).trim() || "Unspecified";
      const key = `${o.category}::${partner}`;
      const cur = map.get(key) || { name: partner, category: o.category, count: 0, pending: 0, cost: 0 };
      cur.count += 1;
      if (!o.status || ["ordered", "sample_collected"].includes(o.status)) cur.pending += 1;
      cur.cost += Number(o.cost || 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [dateScoped]);

  const updateOrder = async (id: string, patch: Partial<OrderRow>) => {
    const { error } = await supabase.from("diagnostic_orders").update(patch as any).eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Updated" });
    await load();
    if (selected && selected.id === id) {
      setSelected({ ...selected, ...patch } as OrderRow);
    }
  };

  const handleStatusChange = (o: OrderRow, status: string) => {
    const patch: any = { status };
    if (status === "sample_collected" && !o.sample_collected_at) patch.sample_collected_at = new Date().toISOString();
    if (status === "report_received" && !o.report_received_at) patch.report_received_at = new Date().toISOString();
    if (status === "reviewed" && !o.reviewed_at) patch.reviewed_at = new Date().toISOString();
    updateOrder(o.id, patch);
  };

  const parseReportUrls = (val: string | null): string[] =>
    !val ? [] : val.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  const handleUploadReports = async (o: OrderRow, files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    const uploadedUrls: string[] = [];
    const uploadedSizes: number[] = [];
    for (const file of list) {
      const ext = file.name.split(".").pop();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${o.patient_id}/${o.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("diagnostic-reports")
        .upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (upErr) {
        toast({ title: `Upload failed: ${file.name}`, description: upErr.message, variant: "destructive" });
        continue;
      }
      const { data: urlData } = supabase.storage.from("diagnostic-reports").getPublicUrl(path);
      uploadedUrls.push(urlData.publicUrl);
      uploadedSizes.push(file.size);
    }
    if (uploadedUrls.length > 0) {
      const existing = parseReportUrls(o.report_url);
      const existingSizes = Array.isArray(o.report_sizes) ? o.report_sizes : [];
      const merged = [...existing, ...uploadedUrls].join("\n");
      const mergedSizes = [...existingSizes, ...uploadedSizes];
      await updateOrder(o.id, {
        report_url: merged,
        report_sizes: mergedSizes,
        report_received_at: o.report_received_at || new Date().toISOString(),
        status: o.status === "reviewed" ? o.status : "report_received",
      } as any);
      toast({ title: "Uploaded", description: `${uploadedUrls.length} file(s) uploaded.` });
    }
    setUploading(false);
  };

  const handleRemoveReport = async (o: OrderRow, url: string) => {
    const urls = parseReportUrls(o.report_url);
    const remainingUrls = urls.filter((u) => u !== url);
    const existingSizes = Array.isArray(o.report_sizes) ? o.report_sizes : [];
    const urlIndex = urls.findIndex((u) => u === url);
    const remainingSizes = urlIndex >= 0
      ? existingSizes.filter((_, idx) => idx !== urlIndex)
      : existingSizes;
    await updateOrder(o.id, {
      report_url: remainingUrls.length ? remainingUrls.join("\n") : null,
      report_sizes: remainingSizes.length ? remainingSizes : null,
    } as any);
  };

  const extractReportPath = (url: string): string | null => {
    if (!url) return null;
    const marker = "/diagnostic-reports/";
    const idx = url.indexOf(marker);
    if (idx >= 0) return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    // already a path
    return url.startsWith("http") ? null : url;
  };

  const openReport = async (url: string) => {
    const path = extractReportPath(url);
    if (!path) {
      toast({ title: "Invalid report link", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.storage
      .from("diagnostic-reports")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "Unable to open report", description: error?.message || "File not found", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  const StatCard = ({ label, value, icon: Icon, color }: any) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-md flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-primary-foreground" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="text-primary" /> External Referrals
          </h1>
          <p className="text-sm text-muted-foreground">
            Track all patients sent to external Scan Centers and Blood Labs from the clinic workflow.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter
            preset={dateFilter.preset}
            onPresetChange={dateFilter.setPreset}
            customFrom={dateFilter.customFrom}
            customTo={dateFilter.customTo}
            onCustomFromChange={dateFilter.setCustomFrom}
            onCustomToChange={dateFilter.setCustomTo}
            showYesterday
            hideTomorrow
            hideAll={false}
          />
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} className="mr-1" /> Add Referral
          </Button>
        </div>
      </div>


      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Referrals" value={stats.total} icon={FileText} color="bg-primary" />
        <StatCard label="Scan Center" value={stats.scan} icon={FlaskConical} color="bg-blue-500" />
        <StatCard label="Blood Test" value={stats.blood} icon={FlaskConical} color="bg-rose-500" />
        <StatCard label="Pending" value={stats.pending} icon={Eye} color="bg-amber-500" />
        <StatCard label="Total Commission" value={`₹${stats.totalCost.toLocaleString()}`} icon={IndianRupee} color="bg-emerald-500" />
      </div>

      {partnerBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Partner-wise Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {partnerBreakdown.map((p) => (
                <div key={`${p.category}-${p.name}`} className="flex items-center justify-between rounded border p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <Badge variant="secondary" className="mt-1 text-[10px]">{CATEGORY_LABEL[p.category] || p.category}</Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{p.count}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.pending} pending · ₹{p.cost.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search patient, partner, test, code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-7"
              />
            </div>
            <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="scan_center">Scan Center</TabsTrigger>
                <TabsTrigger value="blood_test">Blood Test</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={partnerFilter} onValueChange={setPartnerFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Partners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Partners</SelectItem>
                {partnerOptions.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No external referrals yet. Add diagnostic orders from the Clinic Workflow → X-Ray & Blood Test step.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Tests</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedFiltered.map((o, idx) => {
                  const tests = Array.isArray(o.tests) ? o.tests : [];
                  const partner = o.scan_center || o.blood_lab || "-";
                  const patientName = `${o.patient?.first_name ?? ""} ${o.patient?.last_name ?? ""}`.trim() || "Unknown";
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs text-muted-foreground">{(page - 1) * pageSize + idx + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium">{patientName}</div>
                        {o.patient?.patient_code && (
                          <div className="text-xs text-muted-foreground">{o.patient.patient_code}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{CATEGORY_LABEL[o.category] || o.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{partner}</TableCell>
                      <TableCell className="text-sm max-w-[220px] truncate" title={tests.join(", ")}>
                        {tests.join(", ") || "-"}
                      </TableCell>
                      <TableCell className="text-sm">{o.doctor || "-"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">₹{Number(o.cost || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Select value={o.status ?? "ordered"} onValueChange={(v) => handleStatusChange(o, v)}>
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {o.report_url ? (
                          <button
                            type="button"
                            onClick={() => openReport(parseReportUrls(o.report_url)[0] || o.report_url!)}
                            className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                          >
                            <ExternalLink size={12} /> View
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No report</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setSelected(o)}>
                          <Eye size={14} className="mr-1" /> Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="referrals" />
        </CardContent>
      </Card>

      {/* Details dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FlaskConical size={18} />
                  Referral Details
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Patient</Label>
                    <div className="font-medium">
                      {selected.patient
                        ? `${selected.patient.first_name} ${selected.patient.last_name}`
                        : "Unknown"}
                    </div>
                    {selected.patient?.id && (
                      <Link
                        to={`/clinic-workflow?patient=${selected.patient.id}&step=diagnostics`}
                        className="text-xs text-primary hover:underline"
                      >
                        Open in workflow →
                      </Link>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <div>{selected.patient?.phone || "-"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <div><Badge variant="secondary">{CATEGORY_LABEL[selected.category] || selected.category}</Badge></div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Partner</Label>
                    <div>{selected.scan_center || selected.blood_lab || "-"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Referred By</Label>
                    <div>{selected.doctor || "-"}</div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ordered On</Label>
                    <div>{new Date(selected.created_at).toLocaleString()}</div>
                  </div>
                  {selected.sample_collected_at && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Sample Collected</Label>
                      <div>{new Date(selected.sample_collected_at).toLocaleString()}</div>
                    </div>
                  )}
                  {selected.report_received_at && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Report Received</Label>
                      <div>{new Date(selected.report_received_at).toLocaleString()}</div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Tests Ordered</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(selected.tests || []).map((t) => (
                      <Badge key={t} variant="outline">{t}</Badge>
                    ))}
                    {(!selected.tests || selected.tests.length === 0) && <span className="text-sm">-</span>}
                  </div>
                </div>

                {selected.notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <div className="text-sm">{selected.notes}</div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Commission (₹)</Label>
                    <Input
                      type="number"
                      defaultValue={selected.cost ?? 0}
                      onBlur={(e) => {
                        const v = Number(e.target.value || 0);
                        if (v !== Number(selected.cost || 0)) updateOrder(selected.id, { cost: v });
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Reviewed By</Label>
                    <Select
                      value={selected.reviewed_by ?? "__none__"}
                      onValueChange={(value) => {
                        const reviewed_by = value === "__none__" ? null : value;
                        if (reviewed_by !== selected.reviewed_by) {
                          updateOrder(selected.id, { reviewed_by } as any);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select doctor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not reviewed</SelectItem>
                        {doctorOptions.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                        {selected.reviewed_by && !doctorOptions.some((d) => d.value === selected.reviewed_by) && (
                          <SelectItem value={selected.reviewed_by}>{selected.reviewed_by}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Lab Reports (PDF/JPG/PNG — multiple allowed)</Label>
                    <label className="inline-flex">
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf,application/pdf"
                        multiple
                        disabled={uploading}
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            handleUploadReports(selected, e.target.files);
                            e.target.value = "";
                          }
                        }}
                      />
                      <Button size="sm" variant="outline" asChild disabled={uploading}>
                        <span><Upload size={14} className="mr-1" /> {uploading ? "Uploading..." : "Upload Files"}</span>
                      </Button>
                    </label>
                  </div>
                  {parseReportUrls(selected.report_url).length > 0 ? (
                    <div className="space-y-1.5">
                      {parseReportUrls(selected.report_url).map((url, idx) => {
                        const name = decodeURIComponent(url.split("/").pop() || `Report ${idx + 1}`);
                        const size = Array.isArray(selected.report_sizes) ? selected.report_sizes[idx] : null;
                        return (
                          <div key={url} className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-sm w-full min-w-0 overflow-hidden">
                            <button type="button" onClick={() => openReport(url)} className="flex items-center gap-1 text-primary hover:underline min-w-0 flex-1 overflow-hidden text-left">
                              <ExternalLink size={14} className="shrink-0" />
                              <span className="break-all block min-w-0">{name}</span>
                              {size != null && (
                                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                                  ({formatFileSize(Number(size))})
                                </span>
                              )}
                            </button>
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive shrink-0" onClick={() => handleRemoveReport(selected, url)}>
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No reports uploaded yet.</p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AddExternalReferralDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={load}
        onViewExisting={async (row) => {
          const existing = orders.find((o) => o.id === row.id);
          if (existing) {
            setSelected(existing);
            return;
          }
          const { data: p } = await supabase
            .from("patients")
            .select("id, first_name, last_name, phone, patient_code")
            .eq("id", row.patient_id)
            .maybeSingle();
          setSelected({ ...row, patient: (p as any) || null } as OrderRow);
        }}
      />
    </div>
  );
}
