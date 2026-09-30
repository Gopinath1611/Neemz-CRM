import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

export interface EmployeeFilters {
  q: string;
  location: string;
  jobTitle: string;
  department: string;
  role: string;
  band: string;
  division: string;
  shift: string;
  status: string;
}

export interface ShiftFilters {
  shiftName: string;
  department: string;
  location: string;
}

export const EMPTY_EMPLOYEE_FILTERS: EmployeeFilters = {
  q: "", location: "", jobTitle: "", department: "", role: "", band: "", division: "", shift: "", status: "active",
};

export const EMPTY_SHIFT_FILTERS: ShiftFilters = { shiftName: "", department: "", location: "" };

const ANY = "__any__";

export interface FilterOptions {
  locations: string[];
  jobTitles: string[];
  departments: string[];
  roles: string[];
  bands: string[];
  divisions: string[];
  shifts: string[];
}

const OptionSelect = ({
  label, value, options, onChange, placeholder,
}: { label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
    <Select value={value || ANY} onValueChange={(v) => onChange(v === ANY ? "" : v)}>
      <SelectTrigger className="h-9"><SelectValue placeholder={placeholder || `All ${label.toLowerCase()}`} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>All</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g, " ")}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export const EmployeeFilterDialog = ({
  open, onOpenChange, value, options, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: EmployeeFilters;
  options: FilterOptions;
  onApply: (f: EmployeeFilters) => void;
}) => {
  const set = (patch: Partial<EmployeeFilters>) => onApply({ ...value, ...patch });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Filter — Employee View</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-medium text-muted-foreground">Employee name or ID</Label>
            <Input className="h-9" placeholder="Search name or employee code" value={value.q} onChange={(e) => set({ q: e.target.value })} />
          </div>
          <OptionSelect label="Locations" value={value.location} options={options.locations} onChange={(v) => set({ location: v })} />
          <OptionSelect label="Job titles" value={value.jobTitle} options={options.jobTitles} onChange={(v) => set({ jobTitle: v })} />
          <OptionSelect label="Departments" value={value.department} options={options.departments} onChange={(v) => set({ department: v })} />
          <OptionSelect label="Roles" value={value.role} options={options.roles} onChange={(v) => set({ role: v })} />
          <OptionSelect label="Bands" value={value.band} options={options.bands} onChange={(v) => set({ band: v })} />
          <OptionSelect label="Divisions" value={value.division} options={options.divisions} onChange={(v) => set({ division: v })} />
          <OptionSelect label="Shifts" value={value.shift} options={options.shifts} onChange={(v) => set({ shift: v })} />
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Employee status</Label>
            {value.status ? (
              <div>
                <Badge variant="secondary" className="gap-1 capitalize font-normal">
                  {value.status}
                  <button type="button" onClick={() => set({ status: "" })} aria-label="Clear status"><X size={12} /></button>
                </Badge>
              </div>
            ) : (
              <Select value={ANY} onValueChange={(v) => set({ status: v === ANY ? "" : v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onApply(EMPTY_EMPLOYEE_FILTERS); onOpenChange(false); }}>Reset &amp; Apply</Button>
          <Button onClick={() => onOpenChange(false)}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const ShiftFilterDialog = ({
  open, onOpenChange, value, options, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: ShiftFilters;
  options: Pick<FilterOptions, "shifts" | "departments" | "locations">;
  onApply: (f: ShiftFilters) => void;
}) => {
  const set = (patch: Partial<ShiftFilters>) => onApply({ ...value, ...patch });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Filter — Shift View</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <OptionSelect label="Shift name" value={value.shiftName} options={options.shifts} onChange={(v) => set({ shiftName: v })} />
          <OptionSelect label="Departments" value={value.department} options={options.departments} onChange={(v) => set({ department: v })} />
          <OptionSelect label="Locations" value={value.location} options={options.locations} onChange={(v) => set({ location: v })} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onApply(EMPTY_SHIFT_FILTERS); onOpenChange(false); }}>Reset &amp; Apply</Button>
          <Button onClick={() => onOpenChange(false)}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
