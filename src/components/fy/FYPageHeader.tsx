import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCcw } from "lucide-react";
import { generateFYOptions } from "@/lib/fyProjection";
import { useMemo } from "react";
import { useBranch } from "@/contexts/BranchContext";

interface Props {
  title: string;
  description?: string;
  fy: string;
  onFYChange: (v: string) => void;
  onSync?: () => void;
  loading?: boolean;
}

export default function FYPageHeader({ title, description, fy, onFYChange, onSync, loading }: Props) {
  const fyOptions = useMemo(() => generateFYOptions(), []);
  const { currentBranchId, branches } = useBranch();
  const branchName = branches.find(b => b.id === currentBranchId)?.name;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {description ? `${description} · ` : ""}FY {fy}{branchName ? ` · ${branchName}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={fy} onValueChange={onFYChange}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{fyOptions.map(o => <SelectItem key={o} value={o}>FY {o}</SelectItem>)}</SelectContent>
        </Select>
        {onSync && (
          <Button onClick={onSync} disabled={loading} variant="outline" size="sm">
            <RefreshCcw className="h-4 w-4 mr-2" /> Sync Actuals
          </Button>
        )}
      </div>
    </div>
  );
}

export function NoBranchCard() {
  return (
    <div className="p-6 text-center text-muted-foreground">
      Select a branch to view FY Projection data.
    </div>
  );
}
