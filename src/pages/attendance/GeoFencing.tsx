import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Plus, Edit, Trash2, Navigation } from "lucide-react";
import { toast } from "sonner";

const MARITAL = ["single", "married", "other"];

const GeoFencing = () => {
  const [zones, setZones] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", place_address: "", latitude: "", longitude: "", radius_meters: 200, applicable_departments: [], applicable_locations: [], applicable_employees: [], applicable_marital_status: [], excluded_employees: [], is_active: true });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const { data: z } = await supabase.from("geofence_zones").select("*").order("created_at", { ascending: false });
    setZones(z || []);
    const { data: e } = await supabase.from("employees").select("id, first_name, last_name, employee_code, department, extra_details").eq("status", "active").order("first_name");
    setEmployees(e || []);
    setDepartments(Array.from(new Set((e || []).map((x: any) => x.department).filter(Boolean))) as string[]);
    setLocations(Array.from(new Set((e || []).map((x: any) => x.extra_details?.location).filter(Boolean))) as string[]);
  };

  const resetForm = () => setForm({ name: "", place_address: "", latitude: "", longitude: "", radius_meters: 200, applicable_departments: [], applicable_locations: [], applicable_employees: [], applicable_marital_status: [], excluded_employees: [], is_active: true });

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      setForm((f: any) => ({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }));
      toast.success("Current location captured");
    }, () => toast.error("Could not get location"));
  };

  const handleSave = async () => {
    if (!form.name || !form.latitude || !form.longitude) { toast.error("Name, lat, lng required"); return; }
    const payload = { ...form, latitude: parseFloat(form.latitude), longitude: parseFloat(form.longitude), radius_meters: parseInt(form.radius_meters) || 200 };
    const { error } = editing
      ? await supabase.from("geofence_zones").update(payload).eq("id", editing.id)
      : await supabase.from("geofence_zones").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setOpen(false); setEditing(null); resetForm(); fetchAll(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this geo-fence?")) return;
    const { error } = await supabase.from("geofence_zones").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); fetchAll(); }
  };

  const startEdit = (z: any) => { setEditing(z); setForm({ ...z, latitude: String(z.latitude), longitude: String(z.longitude) }); setOpen(true); };

  const toggleArr = (key: string, val: string) => {
    setForm((f: any) => ({ ...f, [key]: f[key].includes(val) ? f[key].filter((x: string) => x !== val) : [...f[key], val] }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MapPin className="h-6 w-6 text-primary" /> Geo Fencing</h1>
          <p className="text-sm text-muted-foreground">Manage location-based attendance zones</p>
        </div>
        <Button onClick={() => { resetForm(); setEditing(null); setOpen(true); }} className="gap-2"><Plus size={16} /> Add Geo Fence</Button>
      </div>

      <div className="grid gap-3">
        {zones.map((z) => (
          <Card key={z.id}><CardContent className="pt-4 flex justify-between items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{z.name}</span>
                <Badge variant={z.is_active ? "default" : "secondary"}>{z.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              {z.place_address && <div className="text-xs text-muted-foreground mt-1">{z.place_address}</div>}
              <div className="text-xs mt-1">
                <Navigation size={10} className="inline mr-1" />
                {Number(z.latitude).toFixed(4)}, {Number(z.longitude).toFixed(4)} • Radius: {z.radius_meters}m
              </div>
              <div className="flex flex-wrap gap-1 mt-2 text-[10px]">
                {z.applicable_departments?.length > 0 && <Badge variant="outline">Depts: {z.applicable_departments.join(", ")}</Badge>}
                {z.applicable_locations?.length > 0 && <Badge variant="outline">Locations: {z.applicable_locations.join(", ")}</Badge>}
                {z.applicable_employees?.length > 0 && <Badge variant="outline">{z.applicable_employees.length} employees</Badge>}
                {z.excluded_employees?.length > 0 && <Badge variant="destructive">{z.excluded_employees.length} excluded</Badge>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => startEdit(z)}><Edit size={14} /></Button>
              <Button size="icon" variant="ghost" onClick={() => handleDelete(z.id)}><Trash2 size={14} className="text-destructive" /></Button>
            </div>
          </CardContent></Card>
        ))}
        {zones.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">No geo-fence zones yet</CardContent></Card>}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Geo Fence</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Salem Clinic" /></div>
            <div><Label>Place Address</Label><Textarea value={form.place_address} onChange={(e) => setForm({ ...form, place_address: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Latitude *</Label><Input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="11.6643" /></div>
              <div><Label>Longitude *</Label><Input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="78.1460" /></div>
              <div><Label>Radius (m)</Label><Input type="number" value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: e.target.value })} /></div>
            </div>
            <Button type="button" variant="outline" onClick={useCurrentLocation} className="w-full gap-2"><Navigation size={14} /> Use My Current Location</Button>

            <div className="border-t pt-3 space-y-3">
              <Label className="text-base font-semibold">Applicable Settings</Label>

              <div>
                <Label className="text-xs">Available to Departments</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {departments.map((d) => <Button key={d} type="button" size="sm" variant={form.applicable_departments.includes(d) ? "default" : "outline"} onClick={() => toggleArr("applicable_departments", d)}>{d}</Button>)}
                  {departments.length === 0 && <p className="text-xs text-muted-foreground">No departments yet</p>}
                </div>
              </div>

              <div>
                <Label className="text-xs">Available to Office Locations</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {locations.map((l) => <Button key={l} type="button" size="sm" variant={form.applicable_locations.includes(l) ? "default" : "outline"} onClick={() => toggleArr("applicable_locations", l)}>{l}</Button>)}
                  {locations.length === 0 && <p className="text-xs text-muted-foreground">No locations yet</p>}
                </div>
              </div>

              <div>
                <Label className="text-xs">Available to Marital Status</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {MARITAL.map((m) => <Button key={m} type="button" size="sm" variant={form.applicable_marital_status.includes(m) ? "default" : "outline"} onClick={() => toggleArr("applicable_marital_status", m)} className="capitalize">{m}</Button>)}
                </div>
              </div>

              <div>
                <Label className="text-xs">Available to Employees</Label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 flex flex-wrap gap-1">
                  {employees.map((e) => <Button key={e.id} type="button" size="sm" variant={form.applicable_employees.includes(e.id) ? "default" : "outline"} onClick={() => toggleArr("applicable_employees", e.id)}>{e.first_name} {e.last_name}</Button>)}
                </div>
              </div>

              <div>
                <Label className="text-xs">Exclude Employees</Label>
                <div className="max-h-32 overflow-y-auto border rounded p-2 flex flex-wrap gap-1">
                  {employees.map((e) => <Button key={e.id} type="button" size="sm" variant={form.excluded_employees.includes(e.id) ? "destructive" : "outline"} onClick={() => toggleArr("excluded_employees", e.id)}>{e.first_name} {e.last_name}</Button>)}
                </div>
              </div>

              <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} className="flex-1">Save</Button>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GeoFencing;
