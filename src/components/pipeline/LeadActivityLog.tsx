import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";
import { initialsOf } from "@/hooks/useCrmUsers";

interface Props {
  leadId: string;
  refreshKey?: number;
}

export const LeadActivityLog = ({ leadId, refreshKey = 0 }: Props) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("lead_activity")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setRows(data || []);
        setLoading(false);
      }
    };
    if (leadId) load();
    return () => { cancelled = true; };
  }, [leadId, refreshKey]);

  if (loading) return <p className="text-xs text-muted-foreground text-center py-4">Loading activity...</p>;

  if (rows.length === 0) {
    return (
      <div className="text-center py-10 space-y-2 border border-dashed border-border rounded-lg">
        <History size={24} className="mx-auto text-muted-foreground" />
        <p className="text-xs text-muted-foreground">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">
            {initialsOf(r.user_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs">{r.description}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[9px]">{r.action}</Badge>
              <span className="text-[10px] text-muted-foreground">
                {r.user_name || "System"} · {format(new Date(r.created_at), "dd MMM yyyy, hh:mm a")}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
