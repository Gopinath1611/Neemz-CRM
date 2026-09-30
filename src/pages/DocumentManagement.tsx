import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FileText, FolderOpen, Download, Upload, AlertTriangle, Wand2 } from "lucide-react";
import OfferLetterGeneratorModal from "@/components/documents/OfferLetterGeneratorModal";
import { APPOINTMENT_CONFIG, CONFIRMATION_CONFIG } from "@/lib/offerLetterTemplate";
import { toast } from "sonner";
import { differenceInDays, format, parseISO } from "date-fns";

export default function DocumentManagement() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("documents");
  const [catDialog, setCatDialog] = useState(false);
  const [docDialog, setDocDialog] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [editDoc, setEditDoc] = useState<any>(null);
  const [filterEmp, setFilterEmp] = useState<string>("all");
  const [offerCat, setOfferCat] = useState<string | null>(null);
  const [apptCat, setApptCat] = useState<string | null>(null);
  const [confCat, setConfCat] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["document_categories"],
    queryFn: async () => {
      const { data } = await supabase.from("document_categories").select("*").order("sort_order").order("name");
      return data || [];
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["employee_documents"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_documents")
        .select("*, employees(first_name, last_name, employee_code), document_categories(name)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-doc"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code, designation, department").eq("status", "active").order("first_name");
      return data || [];
    },
  });

  const saveCat = useMutation({
    mutationFn: async (vals: any) => {
      if (vals.id) {
        const { error } = await supabase.from("document_categories").update(vals).eq("id", vals.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("document_categories").insert(vals);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["document_categories"] }); setCatDialog(false); setEditCat(null); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const delCat = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("document_categories").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["document_categories"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveDoc = useMutation({
    mutationFn: async (vals: any) => {
      if (vals.id) {
        const { error } = await supabase.from("employee_documents").update(vals).eq("id", vals.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employee_documents").insert(vals);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee_documents"] }); setDocDialog(false); setEditDoc(null); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const delDoc = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.file_path) await supabase.storage.from("hr-documents").remove([doc.file_path]);
      const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["employee_documents"] }); toast.success("Deleted"); },
  });

  const filteredDocs = useMemo(() => {
    return documents.filter((d: any) => filterEmp === "all" || d.employee_id === filterEmp);
  }, [documents, filterEmp]);

  const expiringCount = documents.filter((d: any) => {
    if (!d.expiry_date) return false;
    const days = differenceInDays(parseISO(d.expiry_date), new Date());
    return days <= (d.reminder_days || 15);
  }).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Document Management</h1>
          <p className="text-sm text-muted-foreground">Manage employee documents and categories</p>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Categories</p><p className="text-2xl font-bold">{categories.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Documents</p><p className="text-2xl font-bold">{documents.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Employees</p><p className="text-2xl font-bold">{new Set(documents.map((d: any) => d.employee_id)).size}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Expiring Soon</p><p className="text-2xl font-bold text-amber-600">{expiringCount}</p></div><AlertTriangle className="h-5 w-5 text-amber-600" /></div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="documents">Employee Documents</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-3">
          <div className="flex justify-between flex-wrap gap-3">
            <Select value={filterEmp} onValueChange={setFilterEmp}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Dialog open={docDialog} onOpenChange={(o) => { setDocDialog(o); if (!o) setEditDoc(null); }}>
              <DialogTrigger asChild><Button onClick={() => setEditDoc({})}><Plus className="h-4 w-4 mr-1" /> Upload Document</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editDoc?.id ? "Edit" : "Upload"} Document</DialogTitle></DialogHeader>
                <DocForm initial={editDoc} categories={categories} employees={employees} onSave={(v) => saveDoc.mutate(v)} />
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Category</TableHead><TableHead>Document</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredDocs.map((d: any) => {
                  const expDays = d.expiry_date ? differenceInDays(parseISO(d.expiry_date), new Date()) : null;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.employees?.first_name} {d.employees?.last_name}</TableCell>
                      <TableCell><Badge variant="outline">{d.document_categories?.name}</Badge></TableCell>
                      <TableCell>{d.document_name}</TableCell>
                      <TableCell>{expDays !== null ? (
                        <Badge variant={expDays < 0 ? "destructive" : expDays <= (d.reminder_days || 15) ? "secondary" : "outline"} className={expDays >= 0 && expDays <= (d.reminder_days || 15) ? "bg-amber-100 text-amber-700 border-amber-300" : ""}>
                          {expDays < 0 ? `${Math.abs(expDays)}d ago` : `${expDays}d left`}
                        </Badge>
                      ) : "-"}</TableCell>
                      <TableCell className="text-right">
                        {d.file_url && <Button variant="ghost" size="icon" asChild><a href={d.file_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a></Button>}
                        <Button variant="ghost" size="icon" onClick={() => { setEditDoc(d); setDocDialog(true); }}><Pencil className="h-4 w-4" /></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>Delete document?</AlertDialogTitle><AlertDialogDescription>This will permanently remove the file.</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => delDoc.mutate(d)}>Delete</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredDocs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No documents</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={catDialog} onOpenChange={(o) => { setCatDialog(o); if (!o) setEditCat(null); }}>
              <DialogTrigger asChild><Button onClick={() => setEditCat({})}><Plus className="h-4 w-4 mr-1" /> Add Category</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editCat?.id ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
                <CatForm initial={editCat} onSave={(v) => saveCat.mutate(v)} />
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Has Expiry</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {categories.map((c: any) => (
                  <TableRow key={c.id} className={!c.is_active ? "opacity-60" : ""}>
                    <TableCell className="font-medium flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary" />{c.name}</TableCell>
                    <TableCell>{c.description || "-"}</TableCell>
                    <TableCell>{c.requires_expiry ? "Yes" : "No"}</TableCell>
                    <TableCell><Switch checked={c.is_active} onCheckedChange={(v) => saveCat.mutate({ ...c, is_active: v })} /></TableCell>
                    <TableCell className="text-right">
                      {/offer\s*letter/i.test(c.name || "") && (
                        <Button variant="ghost" size="icon" title="Configure / Generate" onClick={() => setOfferCat(c.id)}><Wand2 className="h-4 w-4 text-primary" /></Button>
                      )}
                      {/appointment\s*(letter|order)/i.test(c.name || "") && (
                        <Button variant="ghost" size="icon" title="Configure / Generate" onClick={() => setApptCat(c.id)}><Wand2 className="h-4 w-4 text-primary" /></Button>
                      )}
                      {/confirmation\s*(letter|order)/i.test(c.name || "") && (
                        <Button variant="ghost" size="icon" title="Configure / Generate" onClick={() => setConfCat(c.id)}><Wand2 className="h-4 w-4 text-primary" /></Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => { setEditCat(c); setCatDialog(true); }}><Pencil className="h-4 w-4" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Delete category?</AlertDialogTitle><AlertDialogDescription>Cannot delete if documents exist in this category.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => delCat.mutate(c.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
      {offerCat && (
        <OfferLetterGeneratorModal open={!!offerCat} onOpenChange={(o) => !o && setOfferCat(null)} categoryId={offerCat} employees={employees} />
      )}
      {apptCat && (
        <OfferLetterGeneratorModal open={!!apptCat} onOpenChange={(o) => !o && setApptCat(null)} categoryId={apptCat} employees={employees} cfg={APPOINTMENT_CONFIG} />
      )}
      {confCat && (
        <OfferLetterGeneratorModal open={!!confCat} onOpenChange={(o) => !o && setConfCat(null)} categoryId={confCat} employees={employees} cfg={CONFIRMATION_CONFIG} />
      )}
    </div>
  );
}

function CatForm({ initial, onSave }: { initial: any; onSave: (v: any) => void }) {
  const [v, setV] = useState({
    id: initial?.id,
    name: initial?.name || "",
    description: initial?.description || "",
    requires_expiry: initial?.requires_expiry || false,
    is_active: initial?.is_active ?? true,
    sort_order: initial?.sort_order || 0,
  });
  return (
    <div className="space-y-3">
      <div><Label>Name *</Label><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div><Label>Description</Label><Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div className="flex items-center gap-2"><Switch checked={v.requires_expiry} onCheckedChange={(x) => setV({ ...v, requires_expiry: x })} /><Label>Has expiry date</Label></div>
      <DialogFooter><Button onClick={() => onSave(v)} disabled={!v.name}>Save</Button></DialogFooter>
    </div>
  );
}

function DocForm({ initial, categories, employees, onSave }: { initial: any; categories: any[]; employees: any[]; onSave: (v: any) => void }) {
  const [v, setV] = useState({
    id: initial?.id,
    employee_id: initial?.employee_id || "",
    category_id: initial?.category_id || "",
    document_name: initial?.document_name || "",
    file_url: initial?.file_url || "",
    file_path: initial?.file_path || "",
    file_size: initial?.file_size || null,
    mime_type: initial?.mime_type || "",
    issue_date: initial?.issue_date || "",
    expiry_date: initial?.expiry_date || "",
    reminder_days: initial?.reminder_days || 15,
    notes: initial?.notes || "",
  });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!v.employee_id) { toast.error("Select employee first"); return; }
    setUploading(true);
    try {
      const path = `${v.employee_id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("hr-documents").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("hr-documents").getPublicUrl(path);
      setV({ ...v, file_url: data.publicUrl, file_path: path, file_size: file.size, mime_type: file.type, document_name: v.document_name || file.name });
      toast.success("File uploaded");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const cat = categories.find((c: any) => c.id === v.category_id);

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
      <div><Label>Employee *</Label>
        <Select value={v.employee_id} onValueChange={(x) => setV({ ...v, employee_id: x })}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Category *</Label>
        <Select value={v.category_id} onValueChange={(x) => setV({ ...v, category_id: x })}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{categories.filter((c: any) => c.is_active).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Document Name *</Label><Input value={v.document_name} onChange={(e) => setV({ ...v, document_name: e.target.value })} /></div>
      <div>
        <Label>File</Label>
        <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading || !v.employee_id} className="w-full">
          <Upload className="h-4 w-4 mr-2" />{uploading ? "Uploading..." : v.file_url ? "Replace File" : "Upload File"}
        </Button>
        {v.file_url && <a href={v.file_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline mt-1 block">View current file</a>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Issue Date</Label><Input type="date" value={v.issue_date} onChange={(e) => setV({ ...v, issue_date: e.target.value })} /></div>
        <div><Label>Expiry Date{cat?.requires_expiry && " *"}</Label><Input type="date" value={v.expiry_date} onChange={(e) => setV({ ...v, expiry_date: e.target.value })} /></div>
      </div>
      <div><Label>Reminder (days before)</Label><Input type="number" value={v.reminder_days} onChange={(e) => setV({ ...v, reminder_days: Number(e.target.value) })} /></div>
      <div><Label>Notes</Label><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></div>
      <DialogFooter><Button onClick={() => {
        const payload: any = { ...v };
        ["issue_date","expiry_date"].forEach(k => { if (!payload[k]) payload[k] = null; });
        onSave(payload);
      }} disabled={!v.employee_id || !v.category_id || !v.document_name || !v.file_url}>Save</Button></DialogFooter>
    </div>
  );
}
