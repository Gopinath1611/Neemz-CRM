import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Row = { name: string; isTotal?: boolean };

const SECTIONS: { id: string; label: string; color: string; rows: Row[] }[] = [
  {
    id: "earnings",
    label: "Earnings",
    color: "text-emerald-700 bg-emerald-50",
    rows: [
      { name: "Basic" },
      { name: "Fixed Allowance" },
      { name: "House rent allowance" },
      { name: "Conveyance allowance" },
      { name: "Fixed medical allowance" },
      { name: "Total gross pay", isTotal: true },
    ],
  },
  {
    id: "deductions",
    label: "Deductions",
    color: "text-rose-700 bg-rose-50",
    rows: [
      { name: "Uniform" },
      { name: "Late Entry" },
      { name: "Self and Family Treatment cost" },
      { name: "Total deductions", isTotal: true },
    ],
  },
  {
    id: "taxes",
    label: "Taxes",
    color: "text-amber-700 bg-amber-50",
    rows: [
      { name: "Professional tax" },
      { name: "Total taxes", isTotal: true },
    ],
  },
];

interface Props {
  fromDate?: string;
  toDate?: string;
}

export default function PayrollCostSummaryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);

  const flatRows = SECTIONS.flatMap((s) =>
    s.rows.map((r) => ({ section: s.label, component: r.name, type: r.isTotal ? "Total" : "Component" }))
  );

  const exportAs = (format: "csv" | "excel" | "pdf") => {
    if (!generated) {
      toast.error("Generate the report first");
      return;
    }
    if (format === "pdf") {
      const html = `<html><head><title>Payroll Cost Summary Report</title>
        <style>body{font-family:sans-serif;padding:24px}h1{font-size:18px}h2{font-size:14px;margin-top:18px}
        table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;font-size:12px;text-align:left}</style>
        </head><body><h1>Payroll Cost Summary Report</h1>
        ${SECTIONS.map((s) => `<h2>${s.label}</h2><table><thead><tr><th>Salary Component</th><th>Type</th></tr></thead><tbody>
          ${s.rows.map((r) => `<tr><td>${r.name}</td><td>${r.isTotal ? "Total" : "Component"}</td></tr>`).join("")}
        </tbody></table>`).join("")}
        </body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.print(); }
      return;
    }
    const sep = format === "excel" ? "\t" : ",";
    const lines = [
      ["Section", "Salary Component", "Type"].join(sep),
      ...flatRows.map((r) => [r.section, r.component, r.type].join(sep)),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: format === "excel" ? "application/vnd.ms-excel" : "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-cost-summary.${format === "excel" ? "xls" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${format.toUpperCase()}`);
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { setGenerated(true); toast.success("Payroll Cost Summary generated"); }}>
          Generate Report
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("csv")}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("excel")}>
          <Download className="h-3 w-3 mr-1" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportAs("pdf")}>
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
        {(fromDate || toDate) && (
          <Badge variant="outline" className="text-xs">
            {fromDate || "…"} → {toDate || "…"}
          </Badge>
        )}
      </div>

      {!generated ? (
        <div className="rounded-md border bg-background p-8 text-center text-sm text-muted-foreground">
          Apply filters and click <strong>Generate Report</strong> to view the salary structure
        </div>
      ) : (
        <div className="space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.id} className="rounded-md border bg-background overflow-hidden">
              <div className={`px-4 py-2 text-sm font-semibold ${section.color}`}>{section.label}</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Salary Component</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.rows.map((row, i) => (
                    <TableRow key={row.name} className={row.isTotal ? "font-semibold bg-muted/40" : ""}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.isTotal ? "Total" : "Component"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Structure view only — monetary values are intentionally hidden.
          </p>
        </div>
      )}
    </div>
  );
}
