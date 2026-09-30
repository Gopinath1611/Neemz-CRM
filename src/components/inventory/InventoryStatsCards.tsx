import { Package, AlertTriangle, TrendingDown, TrendingUp, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalValue: number;
  stockInQty?: number;
  stockOutQty?: number;
  todayInQty?: number;
  todayOutQty?: number;
  onStockInClick?: () => void;
  onStockOutClick?: () => void;
}

const StatCard = ({ icon: Icon, value, label, sublabel, color, onClick }: any) => (
  <Card className={`shadow-card ${onClick ? "cursor-pointer hover:shadow-card-hover transition" : ""}`} onClick={onClick}>
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold font-display">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{sublabel}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

const InventoryStatsCards = ({ totalItems, lowStockCount, outOfStockCount, totalValue, stockInQty = 0, stockOutQty = 0, todayInQty = 0, todayOutQty = 0, onStockInClick, onStockOutClick }: Props) => (
  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
    <StatCard icon={Package} value={totalItems} label="Total Items" color="bg-primary/10 text-primary" />
    <StatCard icon={AlertTriangle} value={lowStockCount} label="Low Stock" color="bg-warning/10 text-warning" />
    <StatCard icon={TrendingDown} value={outOfStockCount} label="Out of Stock" color="bg-destructive/10 text-destructive" />
    <StatCard icon={TrendingUp} value={`₹${totalValue.toLocaleString("en-IN")}`} label="Stock Value" color="bg-success/10 text-success" />
    <StatCard icon={ArrowDownToLine} value={stockInQty} label="Stock In (range)" sublabel={`Today: +${todayInQty}`} color="bg-info/10 text-info" onClick={onStockInClick} />
    <StatCard icon={ArrowUpFromLine} value={stockOutQty} label="Stock Out (range)" sublabel={`Today: -${todayOutQty}`} color="bg-accent/10 text-accent" onClick={onStockOutClick} />
  </div>
);

export default InventoryStatsCards;
