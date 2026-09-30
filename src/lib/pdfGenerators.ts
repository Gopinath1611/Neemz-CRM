import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } from "@/lib/clinicBranding";

const fmt2 = (n: number | string | null | undefined) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function generatePurchaseInvoicePDF(purchase: any, items: any[]) {
  const branding = await fetchClinicBranding();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Branded clinic header (logo + name + address + phone)
  const headerEnd = await addClinicPdfHeader(doc, branding);

  // Invoice title block
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PURCHASE ORDER", pageWidth - 14, headerEnd, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`PO Number: ${purchase.invoice_number || "N/A"}`, pageWidth - 14, headerEnd + 6, { align: "right" });
  doc.text(`Date: ${format(new Date(purchase.purchase_date), "dd MMM yyyy")}`, pageWidth - 14, headerEnd + 11, { align: "right" });

  const blockY = headerEnd + 16;
  // Supplier details
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Supplier Details", 14, blockY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Name: ${purchase.supplier_name}`, 14, blockY + 6);
  doc.text(`Phone: ${purchase.supplier_phone || "N/A"}`, 14, blockY + 11);
  doc.text(`Type: ${purchase.supplier_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "N/A"}`, 14, blockY + 16);

  // Payment info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Payment Info", pageWidth / 2 + 10, blockY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Method: ${purchase.payment_method?.toUpperCase() || "Cash"}`, pageWidth / 2 + 10, blockY + 6);
  doc.text(`Status: ${purchase.payment_status?.toUpperCase() || "N/A"}`, pageWidth / 2 + 10, blockY + 11);

  // Items table
  const tableData = items.map((item: any, idx: number) => [
    idx + 1,
    item.item_name,
    item.category || "—",
    `${item.quantity} ${item.unit}`,
    `Rs.${fmt2(item.unit_price)}`,
    `Rs.${fmt2(item.total_price)}`,
  ]);

  autoTable(doc, {
    startY: blockY + 24,
    head: [["#", "Item Name", "Category", "Qty", "Unit Price", "Total"]],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 12 },
      4: { halign: "right" },
      5: { halign: "right", fontStyle: "bold" },
    },
    margin: { bottom: 30 },
    didDrawPage: () => addClinicPdfFooter(doc),
  });

  const finalY = (doc as any).lastAutoTable.finalY || 120;

  // Totals
  doc.setDrawColor(200);
  doc.line(pageWidth / 2, finalY + 5, pageWidth - 14, finalY + 5);
  doc.setFontSize(10);
  doc.text("Subtotal:", pageWidth / 2 + 10, finalY + 14);
  doc.text(`Rs.${fmt2(purchase.subtotal)}`, pageWidth - 14, finalY + 14, { align: "right" });

  if (purchase.tax_amount > 0) {
    doc.text("Tax:", pageWidth / 2 + 10, finalY + 21);
    doc.text(`Rs.${fmt2(purchase.tax_amount)}`, pageWidth - 14, finalY + 21, { align: "right" });
  }
  if (purchase.discount_amount > 0) {
    doc.text("Discount:", pageWidth / 2 + 10, finalY + 28);
    doc.text(`-Rs.${fmt2(purchase.discount_amount)}`, pageWidth - 14, finalY + 28, { align: "right" });
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  const totalY = finalY + (purchase.tax_amount > 0 || purchase.discount_amount > 0 ? 38 : 24);
  doc.text("Grand Total:", pageWidth / 2 + 10, totalY);
  doc.text(`Rs.${fmt2(purchase.total_amount)}`, pageWidth - 14, totalY, { align: "right" });

  // Notes
  if (purchase.notes) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Notes: ${purchase.notes}`, 14, totalY + 12);
  }

  doc.save(`Purchase_${purchase.invoice_number || purchase.id}_${format(new Date(purchase.purchase_date), "yyyyMMdd")}.pdf`);
}

export async function generateExpenseReportPDF(expenses: any[], monthLabel: string, categoryLabels: Record<string, string>) {
  const branding = await fetchClinicBranding();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const headerEnd = await addClinicPdfHeader(doc, branding);

  // Title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("MONTHLY EXPENSE REPORT", pageWidth - 14, headerEnd, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(monthLabel, pageWidth - 14, headerEnd + 6, { align: "right" });
  doc.text(`Printed On: ${format(new Date(), "dd-MM-yyyy hh:mm a")}`, pageWidth - 14, headerEnd + 11, { align: "right" });

  // Summary
  const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const categoryBreakdown: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + Number(e.amount || 0);
  });

  const blockY = headerEnd + 18;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 14, blockY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Total Expenses: Rs.${totalAmount.toLocaleString("en-IN")}`, 14, blockY + 6);
  doc.text(`Total Entries: ${expenses.length}`, 14, blockY + 11);

  // Category breakdown
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Category Breakdown", pageWidth / 2 + 10, blockY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const sortedCats = Object.entries(categoryBreakdown).sort(([, a], [, b]) => b - a);
  let catY = blockY + 6;
  sortedCats.slice(0, 8).forEach(([cat, amount]) => {
    doc.text(`${categoryLabels[cat] || cat}: Rs.${amount.toLocaleString("en-IN")}`, pageWidth / 2 + 10, catY);
    catY += 5;
  });

  // Expense table
  const tableData = expenses.map((e: any, idx: number) => [
    idx + 1,
    e.expense_number || "—",
    format(new Date(e.expense_date), "dd MMM"),
    e.description,
    categoryLabels[e.category] || e.category,
    e.paid_to || "—",
    e.payment_method?.toUpperCase() || "Cash",
    Number(e.amount || 0).toLocaleString("en-IN"),
  ]);

  autoTable(doc, {
    startY: Math.max(catY + 6, blockY + 22),
    head: [["#", "Expense No.", "Date", "Description", "Category", "Paid To", "Payment", "Amount (Rs.)"]],
    body: tableData,
    theme: "grid",
    headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: "bold", halign: "center" },
    styles: { fontSize: 8, cellPadding: 3, halign: "center" },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 22 },
      2: { cellWidth: 18 },
      7: { halign: "right", fontStyle: "bold" },
    },
    margin: { bottom: 30 },
    didDrawPage: () => addClinicPdfFooter(doc),
  });

  const finalY = (doc as any).lastAutoTable.finalY || 120;

  // Grand total
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Total:", pageWidth / 2 + 10, finalY + 10);
  doc.text(`Rs.${totalAmount.toLocaleString("en-IN")}`, pageWidth - 14, finalY + 10, { align: "right" });

  doc.save(`Expense_Report_${monthLabel.replace(/\s/g, "_")}.pdf`);
}
