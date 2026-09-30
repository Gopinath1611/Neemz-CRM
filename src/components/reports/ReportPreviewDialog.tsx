import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, FileText, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  periodLabel: string;
  rows: Record<string, any>[];
  loading?: boolean;
  onDownloadExcel: () => void;
  onDownloadPDF: () => void;
  busy?: string | null;
  busyKey?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200];

export function ReportPreviewDialog({
  open, onOpenChange, title, periodLabel, rows, loading,
  onDownloadExcel, onDownloadPDF, busy, busyKey,
}: Props) {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [rows, pageSize, open]);

  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  );
  const startIdx = (safePage - 1) * pageSize;

  const xlsxBusy = busy === `${busyKey}_xlsx`;
  const pdfBusy = busy === `${busyKey}_pdf`;

  // Build compact page numbers (1 … p-1 p p+1 … last)
  const pageNumbers: (number | "...")[] = useMemo(() => {
    const out: (number | "...")[] = [];
    const add = (n: number) => { if (!out.includes(n)) out.push(n); };
    add(1);
    if (safePage - 1 > 2) out.push("...");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) add(i);
    if (safePage + 1 < totalPages - 1) out.push("...");
    if (totalPages > 1) add(totalPages);
    return out;
  }, [safePage, totalPages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {title} — Preview
            <Badge variant="secondary">{rows.length} records</Badge>
            <Badge variant="outline">{periodLabel}</Badge>
          </DialogTitle>
          <DialogDescription>
            Read-only preview. Scroll up/down and left/right. Use pagination below to navigate large data sets.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 border rounded-md overflow-auto bg-background">
          {loading ? (
            <div className="flex items-center justify-center h-full p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="ml-2">Loading data…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
              No records found in selected period.
            </div>
          ) : (
            <div className="min-w-full inline-block align-top">
              <table className="text-xs border-collapse">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="border px-2 py-1.5 text-left font-medium w-12 sticky left-0 bg-muted z-20">#</th>
                    {cols.map((c) => (
                      <th key={c} className="border px-2 py-1.5 text-left font-medium whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/50">
                      <td className="border px-2 py-1 text-muted-foreground sticky left-0 bg-background z-10">
                        {startIdx + i + 1}
                      </td>
                      {cols.map((c) => (
                        <td key={c} className="border px-2 py-1 align-top whitespace-nowrap">
                          <div className="max-w-[320px] truncate" title={String(r[c] ?? "")}>
                            {String(r[c] ?? "")}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="ml-2">
                {startIdx + 1}–{Math.min(startIdx + pageSize, rows.length)} of {rows.length}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={safePage === 1}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(safePage - 1)} disabled={safePage === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((n, idx) =>
                n === "..." ? (
                  <span key={`e${idx}`} className="px-1 text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={n}
                    variant={n === safePage ? "default" : "outline"}
                    size="sm"
                    className="h-8 min-w-8 px-2"
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                )
              )}
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(safePage + 1)} disabled={safePage === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={onDownloadExcel} disabled={!!busy || !rows.length}>
            {xlsxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Download Excel
          </Button>
          <Button onClick={onDownloadPDF} disabled={!!busy || !rows.length}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
