import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

export type DenomMap = Record<string, number>;

export const emptyDenoms = (): DenomMap =>
  DENOMINATIONS.reduce((acc, d) => ({ ...acc, [String(d)]: 0 }), {} as DenomMap);

export const denomTotal = (map: DenomMap | null | undefined): number =>
  DENOMINATIONS.reduce((sum, d) => sum + d * Number(map?.[String(d)] ?? 0), 0);

interface Props {
  value: DenomMap;
  onChange: (next: DenomMap) => void;
  disabled?: boolean;
}

export function DenominationInput({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {DENOMINATIONS.map((d) => {
          const qty = Number(value?.[String(d)] ?? 0);
          return (
            <div key={d} className="space-y-1">
              <Label htmlFor={`denom-${d}`} className="text-xs text-muted-foreground">
                ₹{d} {d <= 10 ? "(note/coin)" : ""}
              </Label>
              <Input
                id={`denom-${d}`}
                type="number"
                min={0}
                inputMode="numeric"
                disabled={disabled}
                value={qty === 0 ? "" : qty}
                placeholder="0"
                onChange={(e) =>
                  onChange({
                    ...value,
                    [String(d)]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
              />
              <p className="text-[11px] text-muted-foreground">= ₹{(d * qty).toLocaleString("en-IN")}</p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
        <span className="text-sm text-muted-foreground">Total counted</span>
        <span className="text-base font-semibold">₹{denomTotal(value).toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}

export default DenominationInput;
