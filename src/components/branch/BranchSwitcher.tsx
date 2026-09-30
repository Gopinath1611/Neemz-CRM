import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, Check, ChevronDown } from "lucide-react";

const BranchSwitcher = () => {
  const { branches, currentBranch, setCurrentBranch } = useBranch();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");

  if (!currentBranch || branches.length === 0) return null;

  // Staff with single branch — show as static badge
  if (!isAdmin && branches.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{currentBranch.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline">{currentBranch.name}</span>
          <span className="sm:hidden">{currentBranch.code}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        <DropdownMenuLabel>Switch Branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onClick={() => setCurrentBranch(b.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col">
              <span className="font-medium">{b.name}</span>
              <span className="text-xs text-muted-foreground">{b.code}</span>
            </div>
            {b.id === currentBranch.id && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default BranchSwitcher;
