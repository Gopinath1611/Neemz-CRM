import { ReactNode, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "sonner";

export type ToggleField = { key: string; label: string; hint?: string; default?: boolean };
export type SelectField = {
  key: string;
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  default: string;
};

export type SettingsSection = {
  id: string;
  title: string;
  description?: string;
  toggles?: ToggleField[];
  selects?: SelectField[];
};

type Values = Record<string, string | boolean>;

const buildDefaults = (sections: SettingsSection[]): Values => {
  const v: Values = {};
  sections.forEach((s) => {
    s.toggles?.forEach((t) => (v[t.key] = t.default ?? true));
    s.selects?.forEach((sel) => (v[sel.key] = sel.default));
  });
  return v;
};

/**
 * Lightweight settings shell for HRMS report configuration pages.
 * Preferences are stored locally (per browser) — no report generation logic
 * or HRMS tables are touched.
 */
export default function ReportsSettingsShell({
  storageKey,
  title,
  description,
  sections,
  children,
}: {
  storageKey: string;
  title: string;
  description: string;
  sections: SettingsSection[];
  children?: ReactNode;
}) {
  const [values, setValues] = useState<Values>(() => buildDefaults(sections));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setValues((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      /* ignore malformed local settings */
    }
  }, [storageKey]);

  const set = (key: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
      toast.success("Settings saved");
    } catch {
      toast.error("Could not save settings");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>

      {children}

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
              {section.description && (
                <CardDescription>{section.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {section.toggles?.map((t) => (
                <div key={t.key} className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor={t.key}>{t.label}</Label>
                    {t.hint && <p className="text-xs text-muted-foreground">{t.hint}</p>}
                  </div>
                  <Switch
                    id={t.key}
                    checked={Boolean(values[t.key])}
                    onCheckedChange={(v) => set(t.key, v)}
                  />
                </div>
              ))}
              {section.selects?.map((sel) => (
                <div key={sel.key} className="space-y-1.5">
                  <Label htmlFor={sel.key}>{sel.label}</Label>
                  <Select
                    value={String(values[sel.key] ?? sel.default)}
                    onValueChange={(v) => set(sel.key, v)}
                  >
                    <SelectTrigger id={sel.key}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sel.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sel.hint && <p className="text-xs text-muted-foreground">{sel.hint}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const EXPORT_FORMATS = [
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "csv", label: "CSV" },
  { value: "pdf", label: "PDF" },
];

export const DATE_RANGES = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_fy", label: "This Financial Year" },
];

export const BRANCH_SCOPES = [
  { value: "current", label: "Current Branch Only" },
  { value: "all", label: "All Branches" },
];

export const ROLE_SCOPES = [
  { value: "admin", label: "Admin Only" },
  { value: "admin_hr", label: "Admin + HR" },
  { value: "admin_hr_manager", label: "Admin + HR + Managers" },
];
