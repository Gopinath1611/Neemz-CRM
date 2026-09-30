import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } from "@/lib/clinicBranding";
import { aggregatePaymentsByMode, modeLabel, parsePaymentSplits, reportBucket } from "@/lib/paymentMode";

type ExportRow = Record<string, string | number>;

const buildTabData = (tabKey: string, d: any): { title: string; rows: ExportRow[] } => {
  switch (tabKey) {
    case "dashboard": {
      const today = new Date().toISOString().split("T")[0];
      const todayRev = d.billings.filter((b: any) => b.created_at?.split("T")[0] === today).reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
      const todayPat = d.appointments.filter((a: any) => a.appointment_date === today).length;
      const totalRev = d.billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
      const converted = d.leads.filter((l: any) => l.status === "converted").length;
      return {
        title: "Owner Dashboard",
        rows: [
          { Metric: "Today's Revenue", Value: `₹${todayRev.toLocaleString()}` },
          { Metric: "Today's Patients", Value: todayPat },
          { Metric: "Total Patients", Value: d.patients.length },
          { Metric: "Total Revenue", Value: `₹${totalRev.toLocaleString()}` },
          { Metric: "Total Leads", Value: d.leads.length },
          { Metric: "Converted Leads", Value: converted },
          { Metric: "Reviews Received", Value: d.reviews.filter((r: any) => r.review_received).length },
        ],
      };
    }
    case "clinic": {
      const totalAppts = d.appointments.length;
      const cancelled = d.appointments.filter((a: any) => a.status === "cancelled").length;
      const noShow = d.appointments.filter((a: any) => a.status === "no_show").length;
      const walkIn = d.appointments.filter((a: any) => a.source === "walk-in").length;
      return {
        title: "Clinic Operations",
        rows: [
          { Metric: "Total Appointments", Value: totalAppts },
          { Metric: "Cancellations", Value: cancelled },
          { Metric: "No-Shows", Value: noShow },
          { Metric: "Cancel Rate", Value: totalAppts > 0 ? `${Math.round((cancelled / totalAppts) * 100)}%` : "0%" },
          { Metric: "No-Show Rate", Value: totalAppts > 0 ? `${Math.round((noShow / totalAppts) * 100)}%` : "0%" },
          { Metric: "Walk-in Patients", Value: walkIn },
          { Metric: "Appointment Patients", Value: totalAppts - walkIn },
          { Metric: "Total Patients", Value: d.patients.length },
        ],
      };
    }
    case "marketing": {
      const sourceCounts: Record<string, { leads: number; converted: number }> = {};
      d.leads.forEach((l: any) => {
        const src = l.source || "unknown";
        if (!sourceCounts[src]) sourceCounts[src] = { leads: 0, converted: 0 };
        sourceCounts[src].leads++;
        if (l.status === "converted") sourceCounts[src].converted++;
      });
      return {
        title: "Marketing Analytics",
        rows: Object.entries(sourceCounts).sort((a, b) => b[1].leads - a[1].leads).map(([source, data]) => ({
          Source: source.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          Leads: data.leads,
          Converted: data.converted,
          "Conversion %": data.leads > 0 ? `${Math.round((data.converted / data.leads) * 100)}%` : "0%",
        })),
      };
    }
    case "sales": {
      const stats: Record<string, { consult: number; accepted: number; revenue: number }> = {};
      d.treatmentItems.forEach((i: any) => {
        const t = i.treatment_type;
        if (!stats[t]) stats[t] = { consult: 0, accepted: 0, revenue: 0 };
        stats[t].consult++;
        if (i.status === "completed") stats[t].accepted++;
        stats[t].revenue += Number(i.estimated_cost || 0);
      });
      d.billingItems.forEach((i: any) => {
        const t = i.treatment_type;
        if (!stats[t]) stats[t] = { consult: 0, accepted: 0, revenue: 0 };
        stats[t].revenue += Number(i.total_price || 0);
      });
      return {
        title: "Sales & Conversion",
        rows: Object.entries(stats).sort((a, b) => b[1].revenue - a[1].revenue).map(([name, data]) => ({
          Treatment: name,
          Consultations: data.consult,
          Accepted: data.accepted,
          "Conversion %": data.consult > 0 ? `${Math.round((data.accepted / data.consult) * 100)}%` : "0%",
          Revenue: `₹${data.revenue.toLocaleString()}`,
        })),
      };
    }
    case "finance": {
      const totalRev = d.billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
      const totalPaid = d.billings.reduce((a: number, b: any) => a + Number(b.amount_paid || 0), 0);
      // Mode-wise totals: prefer billing_payments (authoritative); fall back
      // to per-bill split parsing of billings.payment_method.
      let methodAgg: Record<string, { amount: number; count: number }>;
      if (Array.isArray(d.billingPayments) && d.billingPayments.length > 0) {
        methodAgg = aggregatePaymentsByMode(d.billingPayments);
      } else {
        methodAgg = {};
        d.billings.forEach((b: any) => {
          const splits = parsePaymentSplits(b.payment_method, Number(b.amount_paid || 0));
          splits.forEach((s) => {
            const k = reportBucket(s.mode);
            if (!methodAgg[k]) methodAgg[k] = { amount: 0, count: 0 };
            methodAgg[k].amount += s.amount;
            methodAgg[k].count += 1;
          });
        });
      }
      return {
        title: "Finance Report",
        rows: [
          { Metric: "Total Revenue", Value: `₹${totalRev.toLocaleString()}` },
          { Metric: "Amount Collected", Value: `₹${totalPaid.toLocaleString()}` },
          { Metric: "Outstanding", Value: `₹${(totalRev - totalPaid).toLocaleString()}` },
          { Metric: "Collection %", Value: totalRev > 0 ? `${Math.round((totalPaid / totalRev) * 100)}%` : "0%" },
          { Metric: "Paid Bills", Value: d.billings.filter((b: any) => b.payment_status === "paid").length },
          { Metric: "Pending Bills", Value: d.billings.filter((b: any) => b.payment_status === "pending").length },
          ...Object.entries(methodAgg)
            .filter(([, v]) => v.amount !== 0)
            .map(([m, v]) => ({ Metric: `Payment: ${modeLabel(m)}`, Value: `₹${v.amount.toLocaleString()}` })),
        ],
      };
    }
    case "employee": {
      const docStats: Record<string, { patients: number; revenue: number }> = {};
      d.appointments.forEach((a: any) => { const doc = a.doctor || "Dr. Neemz"; if (!docStats[doc]) docStats[doc] = { patients: 0, revenue: 0 }; docStats[doc].patients++; });
      d.billings.forEach((b: any) => { const doc = "Dr. Neemz"; if (!docStats[doc]) docStats[doc] = { patients: 0, revenue: 0 }; docStats[doc].revenue += Number(b.total_amount || 0); });
      return {
        title: "Employee KPI",
        rows: Object.entries(docStats).map(([name, data]) => ({
          Doctor: name,
          "Patients Seen": data.patients,
          "Revenue Generated": `₹${data.revenue.toLocaleString()}`,
        })),
      };
    }
    case "growth": {
      const totalRev = d.billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0);
      const ltv = d.patients.length > 0 ? Math.round(totalRev / d.patients.length) : 0;
      return {
        title: "Clinic Growth",
        rows: [
          { Metric: "Total Patients", Value: d.patients.length },
          { Metric: "Total Revenue", Value: `₹${totalRev.toLocaleString()}` },
          { Metric: "Patient Lifetime Value", Value: `₹${ltv.toLocaleString()}` },
          { Metric: "Reviews Received", Value: d.reviews.filter((r: any) => r.review_received).length },
        ],
      };
    }
    case "ai":
      return {
        title: "AI Predictive Insights",
        rows: [
          { Metric: "Total Patients", Value: d.patients.length },
          { Metric: "Total Leads", Value: d.leads.length },
          { Metric: "Total Revenue", Value: `₹${d.billings.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0).toLocaleString()}` },
        ],
      };
    default:
      return { title: "Report", rows: [] };
  }
};

export const exportToPDF = async (tabKey: string, d: any, dateLabel: string) => {
  const { title, rows } = buildTabData(tabKey, d);
  if (rows.length === 0) return;

  const branding = await fetchClinicBranding();
  const doc = new jsPDF();
  const startY = await addClinicPdfHeader(doc, branding);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, startY);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text(`Period: ${dateLabel}  |  Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 14, startY + 6);
  doc.setTextColor(0);

  const columns = Object.keys(rows[0]);
  const body = rows.map(r => columns.map(c => String(r[c] ?? "")));

  autoTable(doc, {
    head: [columns],
    body,
    startY: startY + 12,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 58, 95] },
    margin: { bottom: 30 },
    didDrawPage: () => addClinicPdfFooter(doc),
  });

  doc.save(`${branding.name.replace(/\s+/g, "_")}_${title.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
};

export const exportToExcel = (tabKey: string, d: any, dateLabel: string) => {
  const { title, rows } = buildTabData(tabKey, d);
  if (rows.length === 0) return;

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
  XLSX.writeFile(wb, `DrNeemz_${title.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.xlsx`);
};
