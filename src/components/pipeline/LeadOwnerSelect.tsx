import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCrmUsers, initialsOf } from "@/hooks/useCrmUsers";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null | undefined;
  onChange: (userId: string | null, userName: string | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export const LeadOwnerSelect = ({ value, onChange, disabled, className, placeholder = "Unassigned" }: Props) => {
  const { users } = useCrmUsers();

  return (
    <Select
      value={value || "unassigned"}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === "unassigned") return onChange(null, null);
        const picked = users.find((u) => u.id === v);
        onChange(v, picked?.name ?? null);
      }}
    >
      <SelectTrigger className={cn("h-8 text-xs", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">{placeholder}</SelectItem>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            <span className="flex items-center gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">
                {initialsOf(u.name)}
              </span>
              {u.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
