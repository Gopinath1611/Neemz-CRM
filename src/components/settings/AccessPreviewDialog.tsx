import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { roleLabels, type AppRole } from "@/lib/roleAccess";
import {
  buildAccessMaps,
  resolveModuleVisibility,
  resolveModulePermission,
  type ModulePerms,
} from "@/lib/moduleVisibility";

export interface AccessPreviewGroup {
  group: string;
  modules: { path: string; label: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  staffId?: string;
  staffName?: string;
  roles: AppRole[];
  moduleGroups: AccessPreviewGroup[];
}

const AccessPreviewDialog = ({ open, onClose, staffId, staffName, roles, moduleGroups }: Props) => {
  const [loading, setLoading] = useState(false);
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [perms, setPerms] = useState<Record<string, ModulePerms>>({});
  const [onlyVisible, setOnlyVisible] = useState(true);

  useEffect(() => {
    if (!open || !staffId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_module_access")
        .select("module_path, has_access, can_read, can_create, can_edit, can_delete")
        .eq("user_id", staffId);
      if (cancelled) return;
      const maps = buildAccessMaps(data as any);
      setAccess(maps.access);
      setPerms(maps.perms);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, staffId]);

  const isAdmin = roles.includes("admin" as AppRole);
  const usesCustomRecords = Object.keys(access).length > 0;

  const resolved = useMemo(
    () =>
      moduleGroups.map((g) => ({
        group: g.group,
        modules: g.modules.map((m) => {
          const visible = resolveModuleVisibility(roles, access, m.path);
          return {
            ...m,
            visible,
            actions: (["read", "create", "edit", "delete"] as const).filter((a) =>
              visible ? resolveModulePermission(roles, access, perms, m.path, a) : false,
            ),
          };
        }),
      })),
    [moduleGroups, roles, access, perms],
  );

  const total = resolved.reduce((s, g) => s + g.modules.length, 0);
  const visibleCount = resolved.reduce((s, g) => s + g.modules.filter((m) => m.visible).length, 0);
  const roleText = roles.length ? roles.map((r) => roleLabels[r] || r).join(", ") : "No role assigned";

  const copyList = async () => {
    const lines: string[] = [
      `Access Preview — ${staffName || ""}`,
      `Roles: ${roleText}`,
      `Visible modules: ${visibleCount} of ${total}`,
      "",
    ];
    resolved.forEach((g) => {
      const mods = g.modules.filter((m) => (onlyVisible ? m.visible : true));
      if (mods.length === 0) return;
      lines.push(g.group);
      mods.forEach((m) => {
        lines.push(
          `  ${m.visible ? "[visible]" : "[hidden] "} ${m.label} (${m.path})` +
            (m.visible && m.actions.length ? ` — ${m.actions.join("/")}` : ""),
        );
      });
      lines.push("");
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Access list copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={15} /> Access Preview — {staffName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Roles:</span>
              {roles.length === 0 && <Badge variant="outline">No role assigned</Badge>}
              {roles.map((r) => (
                <Badge key={r} variant="secondary">{roleLabels[r] || r}</Badge>
              ))}
            </div>
            <p className="font-medium">
              {roleText} — {visibleCount} of {total} modules visible
            </p>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Admin role bypasses all module restrictions — everything is visible."
                : usesCustomRecords
                  ? "Computed from this user's per-user module access records."
                  : "No per-user module records — role-based defaults apply (full read/create/edit/delete on allowed modules)."}
            </p>
            <p className="text-xs text-muted-foreground">
              This is exactly what they see after logging in. Read-only — opening this changes nothing.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="only-visible" checked={onlyVisible} onCheckedChange={setOnlyVisible} />
              <Label htmlFor="only-visible" className="text-sm">Show only visible modules</Label>
            </div>
            <Button variant="outline" size="sm" onClick={copyList}>
              <Copy size={13} className="mr-1.5" /> Copy list
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-3">
              {resolved.map((g) => {
                const mods = g.modules.filter((m) => (onlyVisible ? m.visible : true));
                if (mods.length === 0) return null;
                return (
                  <div key={g.group} className="rounded-lg border">
                    <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide">
                      {g.group}
                    </div>
                    <div className="divide-y">
                      {mods.map((m) => (
                        <div key={m.path} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate">{m.label}</div>
                            <div className="truncate text-xs text-muted-foreground">{m.path}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {m.visible && m.actions.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {m.actions.map((a) => a[0].toUpperCase()).join(" · ")}
                              </span>
                            )}
                            {m.visible ? (
                              <Badge variant="secondary" className="gap-1">
                                <Eye size={11} /> Visible
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-muted-foreground">
                                <EyeOff size={11} /> Hidden
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AccessPreviewDialog;
