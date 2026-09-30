import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, ChevronRight, ChevronDown, Loader2, Minus, Plus as PlusIcon, Crown, Briefcase, Users, User } from "lucide-react";

interface RoleNode {
  id: string;
  role_key: string;
  display_label: string;
  department: string;
  sub_team: string | null;
  reports_to: string | null;
  is_active: boolean;
  children: RoleNode[];
}

const RoleHierarchyChart = () => {
  const [roles, setRoles] = useState<RoleNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("custom_roles")
      .select("id, role_key, display_label, department, sub_team, reports_to, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("display_label", { ascending: true });
    if (!error) {
      setRoles((data || []).map((r: any) => ({ ...r, children: [] })) as RoleNode[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("role-hierarchy-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_roles" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const tree = useMemo(() => {
    const map: Record<string, RoleNode> = {};
    roles.forEach((r) => { map[r.id] = { ...r, children: [] }; });
    const roots: RoleNode[] = [];
    Object.values(map).forEach((node) => {
      if (node.reports_to && map[node.reports_to]) {
        map[node.reports_to].children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }, [roles]);

  const toggle = (id: string) => {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  };

  const expandAll = () => {
    const m: Record<string, boolean> = {};
    roles.forEach((r) => { m[r.id] = true; });
    setExpanded(m);
  };

  const collapseAll = () => setExpanded({});

  // Color palette per depth level (uses semantic tokens)
  const levelStyles = [
    { bg: "bg-primary/10", border: "border-primary/40", text: "text-primary", badge: "bg-primary text-primary-foreground", icon: Crown },
    { bg: "bg-accent/10", border: "border-accent/40", text: "text-accent", badge: "bg-accent text-accent-foreground", icon: Briefcase },
    { bg: "bg-info/10", border: "border-info/40", text: "text-info", badge: "bg-info text-info-foreground", icon: Users },
    { bg: "bg-success/10", border: "border-success/40", text: "text-success", badge: "bg-success text-success-foreground", icon: User },
    { bg: "bg-warning/10", border: "border-warning/40", text: "text-warning", badge: "bg-warning text-warning-foreground", icon: User },
  ];

  const renderNode = (node: RoleNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded[node.id];
    const style = levelStyles[Math.min(depth, levelStyles.length - 1)];
    const Icon = style.icon;
    return (
      <div key={node.id} className="select-none">
        <div
          className="flex items-center gap-1 py-0.5"
          style={{ paddingLeft: `${depth * 14}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggle(node.id)}
              className={`h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors ${style.text}`}
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : (
            <span className="h-5 w-5 inline-block" />
          )}
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border ${style.bg} ${style.border} hover:shadow-card transition-all`}>
            <Icon size={11} className={style.text} />
            <span className={`text-[11px] font-semibold capitalize ${style.text}`}>{node.display_label}</span>
            <Badge className={`text-[8px] px-1 py-0 capitalize border-transparent ${style.badge}`}>
              {node.department}
            </Badge>
            {node.sub_team && (
              <span className="text-[9px] text-muted-foreground">· {node.sub_team}</span>
            )}
            {hasChildren && (
              <span className={`text-[9px] font-medium ${style.text}`}>({node.children.length})</span>
            )}
          </div>
        </div>
        {hasChildren && isOpen && (
          <div className={`border-l-2 border-dashed ml-3 ${style.border}`}>
            {node.children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Network size={16} className="text-primary" /> Role Hierarchy
          <span className="text-[10px] font-normal text-muted-foreground">(view only)</span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={expandAll}>
            <PlusIcon size={11} className="mr-1" /> Expand all
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={collapseAll}>
            <Minus size={11} className="mr-1" /> Collapse all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tree.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-8">
            No roles to display. Set "Reports To" on roles in Manage Roles to build the hierarchy.
          </div>
        ) : (
          <div className="rounded-lg border p-2 overflow-x-auto bg-gradient-to-br from-background to-muted/30">
            {tree.map((root) => renderNode(root, 0))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RoleHierarchyChart;
