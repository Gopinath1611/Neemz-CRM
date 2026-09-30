import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Calculator,
  CalendarClock,
  CreditCard,
  FileText,
  Landmark,
  Package,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

interface SettingsLink {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

const settingsGroups = [
  {
    id: "payroll-fields",
    title: "Payroll fields",
    description: "Configure the master data fields used across payroll runs.",
    links: [
      { label: "Loan types", icon: <CreditCard className="h-4 w-4" /> },
      { label: "Expense category", icon: <Receipt className="h-4 w-4" /> },
      { label: "Merchant", icon: <ShoppingBag className="h-4 w-4" /> },
      { label: "Cost centre", icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    id: "ctc-components",
    title: "CTC components",
    description: "Manage earnings, statutory deductions, reimbursements and deductions.",
    links: [
      { label: "Earnings", icon: <Wallet className="h-4 w-4" /> },
      { label: "Statutory components", icon: <Landmark className="h-4 w-4" /> },
      { label: "Reimbursements", icon: <Receipt className="h-4 w-4" /> },
      { label: "Deductions", icon: <Calculator className="h-4 w-4" /> },
    ],
  },
  {
    id: "general-settings",
    title: "General settings",
    description: "Templates, schedules, bank details and payroll preferences.",
    links: [
      { label: "Salary templates", icon: <FileText className="h-4 w-4" /> },
      { label: "Organisation bank & tax details", icon: <Landmark className="h-4 w-4" /> },
      { label: "Pay schedule", icon: <CalendarClock className="h-4 w-4" /> },
      { label: "Preferences", icon: <SlidersHorizontal className="h-4 w-4" /> },
      { label: "Templates", icon: <Package className="h-4 w-4" /> },
    ],
  },
];

export default function PayrollReportsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payroll Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage payroll fields, CTC components, and general payroll configuration.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {settingsGroups.map((group) => (
          <Card key={group.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-base">{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              {group.links.map((link) => (
                <Button
                  key={link.label}
                  variant="outline"
                  className="w-full justify-start gap-3 h-11 font-normal"
                  onClick={() => {}}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {link.icon}
                  </span>
                  <span className="truncate">{link.label}</span>
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
