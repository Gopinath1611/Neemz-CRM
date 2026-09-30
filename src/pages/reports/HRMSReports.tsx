import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Building2, Clock, CalendarOff, BadgeIndianRupee, ShieldCheck,
  Download, FileText, Mail, MailX, MapPin, AlertTriangle, Users,
  Receipt, TrendingUp, Calculator, FileBarChart, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import MyCheckinCheckoutReport from "@/components/reports/MyCheckinCheckoutReport";
import EntryExitReport from "@/components/reports/EntryExitReport";
import GeoCheckinCheckoutReport from "@/components/reports/GeoCheckinCheckoutReport";
import FailedGeoFencingReport from "@/components/reports/FailedGeoFencingReport";
import EmployeeAttendanceReport from "@/components/reports/EmployeeAttendanceReport";
import ManualEntryReport from "@/components/reports/ManualEntryReport";
import GracePeriodReport from "@/components/reports/GracePeriodReport";
import AttendanceSummaryReport from "@/components/reports/AttendanceSummaryReport";
import ExpenseClaimSummaryReport from "@/components/reports/ExpenseClaimSummaryReport";
import EmployeeCTCReport from "@/components/reports/EmployeeCTCReport";
import SalaryStatementReport from "@/components/reports/SalaryStatementReport";
import SalaryStatementWithLeaveReport from "@/components/reports/SalaryStatementWithLeaveReport";
import SalaryRevisionReport from "@/components/reports/SalaryRevisionReport";
import SalaryRevisionHistoryReport from "@/components/reports/SalaryRevisionHistoryReport";
import PayrollCostSummaryReport from "@/components/reports/PayrollCostSummaryReport";
import MyLeaveSummaryReport from "@/components/reports/MyLeaveSummaryReport";
import AvailableLeaveSummaryReport from "@/components/reports/AvailableLeaveSummaryReport";
import AppliedLeaveSummaryReport from "@/components/reports/AppliedLeaveSummaryReport";
import ProfessionalTaxReport from "@/components/reports/ProfessionalTaxReport";
import TimeSheetSummaryReport from "@/components/reports/TimeSheetSummaryReport";
import TaskReport from "@/components/reports/TaskReport";
import AppliedLeaveRollOverSummaryReport from "@/components/reports/AppliedLeaveRollOverSummaryReport";
import AppliedCompOffSummaryReport from "@/components/reports/AppliedCompOffSummaryReport";


type ReportItem = {
  id: string;
  label: string;
  icon: any;
  description: string;
};

type ReportGroup = {
  id: string;
  label: string;
  icon: any;
  color: string;
  items: ReportItem[];
};

const REPORT_GROUPS: ReportGroup[] = [
  {
    id: "organization",
    label: "Organization Reports",
    icon: Building2,
    color: "text-blue-600 bg-blue-50",
    items: [
      { id: "sent-mail", label: "Sent Mail Report", icon: Mail, description: "All emails sent from the organization with status & timestamps" },
      { id: "bounced-mail", label: "Bounced Email Report", icon: MailX, description: "Bounced emails with bounce reason & retry attempts" },
      { id: "audit-export", label: "Export Audit Report", icon: FileText, description: "Full audit trail of all data exports done by users" },
      { id: "timesheet-summary", label: "Time Sheet Summary", icon: Clock, description: "Employee weekly/monthly time sheet aggregated view" },
      { id: "task-report", label: "Task Report", icon: FileBarChart, description: "Tasks assigned, completed & pending across the org" },
    ],
  },
  {
    id: "attendance",
    label: "Attendance Tracker Reports",
    icon: Clock,
    color: "text-emerald-600 bg-emerald-50",
    items: [
      { id: "my-checkin-checkout", label: "My Check-in / Check-out Report", icon: Clock, description: "Personal daily check-in & check-out logs" },
      { id: "attendance-summary", label: "Attendance Summary Report", icon: FileBarChart, description: "Monthly summary matrix with payable days, hours & day-wise status" },
      { id: "entry-exit", label: "Entry & Exit Report", icon: Clock, description: "Office entry & exit timestamps for all employees" },
      { id: "geo-checkin-checkout", label: "Geo Check-in / Check-out Report", icon: MapPin, description: "GPS-tagged check-in & check-out with map coordinates" },
      { id: "employee-attendance", label: "Employee Attendance Report", icon: Users, description: "Monthly attendance summary by employee (Present/Absent/HD)" },
      { id: "manual-entry", label: "Manual Entry Report", icon: FileText, description: "Manually marked attendance entries with approver" },
      { id: "grace-noncompliance", label: "Grace Period Non-Compliance Report", icon: AlertTriangle, description: "Late arrivals beyond grace period threshold" },
      { id: "failed-geo-fencing", label: "Failed Geo Fencing Check-in/Check-out", icon: AlertTriangle, description: "Attempts that failed geo-fence validation" },
    ],
  },
  {
    id: "leave",
    label: "Leave Tracker Reports",
    icon: CalendarOff,
    color: "text-amber-600 bg-amber-50",
    items: [
      { id: "my-leave-summary", label: "My Leave Summary", icon: CalendarOff, description: "Personal leave consumption summary for the year" },
      { id: "available-leave", label: "Available Leave Summary", icon: CalendarOff, description: "Available leave balance per employee per leave type" },
      { id: "applied-leave", label: "Applied Leave Summary", icon: FileText, description: "All applied leaves with status (Approved/Rejected/Pending)" },
      { id: "applied-rollover", label: "Applied Leave Roll Over Summary", icon: FileText, description: "Leaves carried forward to next year" },
      { id: "applied-comp-off", label: "Applied Comp Off Summary", icon: FileText, description: "Comp-off requests with working day reference" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll Reports",
    icon: BadgeIndianRupee,
    color: "text-purple-600 bg-purple-50",
    items: [
      { id: "expense-column", label: "Expense Claim Summary", icon: Receipt, description: "Reimbursements & expense claims paid through payroll" },
      { id: "payroll-cost", label: "Payroll Cost Summary Report", icon: Calculator, description: "Total payroll cost broken by month/department/location" },
      { id: "employee-ctc", label: "Employee CTC Details", icon: BadgeIndianRupee, description: "Per-employee Cost-to-Company breakdown" },
      { id: "salary-statement", label: "Employee Salary Statement", icon: FileText, description: "Detailed salary statement per employee per month" },
      { id: "salary-with-leave", label: "Salary Statement with Leave Details", icon: FileText, description: "Salary statement combined with LOP/leave data" },
      { id: "salary-revision", label: "Salary Revision Report", icon: TrendingUp, description: "Salary revisions issued in a given period" },
      { id: "salary-revision-history", label: "Employee Salary Revision History", icon: TrendingUp, description: "Full revision timeline per employee" },
    ],
  },
  {
    id: "statutory",
    label: "Statutory Reports",
    icon: ShieldCheck,
    color: "text-rose-600 bg-rose-50",
    items: [
      { id: "epf-summary", label: "EPF Summary", icon: ShieldCheck, description: "Employee Provident Fund contribution summary" },
      { id: "esi-summary", label: "ESI Summary", icon: ShieldCheck, description: "Employee State Insurance contribution summary" },
      { id: "professional-tax", label: "Professional Tax Summary", icon: ShieldCheck, description: "State-wise professional tax deduction summary" },
    ],
  },
];

export default function HRMSReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "organization";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [search, setSearch] = useState("");
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && t !== activeTab) setActiveTab(t);
  }, [searchParams]);

  const onTabChange = (v: string) => {
    setActiveTab(v);
    setSearchParams({ tab: v });
  };

  const handleExport = (format: "csv" | "excel" | "pdf", reportLabel: string) => {
    toast.success(`${reportLabel} exported as ${format.toUpperCase()}`);
  };

  const handleGenerate = (reportLabel: string) => {
    toast.success(`Generating ${reportLabel}…`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-primary" />
            HRMS Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organization, Attendance, Leave, Payroll & Statutory reports — all in one place
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search reports…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      {/* Global filter bar */}
      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From Date</label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To Date</label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Department / Location</label>
            <Input placeholder="All" />
          </div>
          <div className="flex items-end">
            <Button className="w-full">Apply Filters</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          {REPORT_GROUPS.map((g) => (
            <TabsTrigger key={g.id} value={g.id} className="gap-2">
              <g.icon className="h-4 w-4" />
              <span className="hidden md:inline">{g.label.replace(" Reports", "")}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {REPORT_GROUPS.map((group) => {
          const filtered = group.items.filter((it) =>
            it.label.toLowerCase().includes(search.toLowerCase())
          );
          return (
            <TabsContent key={group.id} value={group.id} className="space-y-4 mt-6">
              <div className="flex items-center gap-2">
                <span className={cn("p-2 rounded-lg", group.color)}>
                  <group.icon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{group.label}</h2>
                  <p className="text-xs text-muted-foreground">{filtered.length} reports available</p>
                </div>
              </div>

              <div className="grid gap-3">
                {filtered.map((report) => {
                  const isOpen = openReport === report.id;
                  return (
                    <Card key={report.id} className="overflow-hidden">
                      <CardHeader
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setOpenReport(isOpen ? null : report.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={cn("p-2 rounded-md", group.color)}>
                              <report.icon className="h-4 w-4" />
                            </span>
                            <div>
                              <CardTitle className="text-base">{report.label}</CardTitle>
                              <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">Ready</Badge>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </div>
                        </div>
                      </CardHeader>

                      {isOpen && report.id === "my-checkin-checkout" && (
                        <CardContent className="border-t bg-muted/20">
                          <MyCheckinCheckoutReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "entry-exit" && (
                        <CardContent className="border-t bg-muted/20">
                          <EntryExitReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "geo-checkin-checkout" && (
                        <CardContent className="border-t bg-muted/20">
                          <GeoCheckinCheckoutReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "employee-attendance" && (
                        <CardContent className="border-t bg-muted/20">
                          <EmployeeAttendanceReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "manual-entry" && (
                        <CardContent className="border-t bg-muted/20">
                          <ManualEntryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "failed-geo-fencing" && (
                        <CardContent className="border-t bg-muted/20">
                          <FailedGeoFencingReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "grace-noncompliance" && (
                        <CardContent className="border-t bg-muted/20">
                          <GracePeriodReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "attendance-summary" && (
                        <CardContent className="border-t bg-muted/20">
                          <AttendanceSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "expense-column" && (
                        <CardContent className="border-t bg-muted/20">
                          <ExpenseClaimSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "employee-ctc" && (
                        <CardContent className="border-t bg-muted/20">
                          <EmployeeCTCReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "salary-statement" && (
                        <CardContent className="border-t bg-muted/20">
                          <SalaryStatementReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "salary-with-leave" && (
                        <CardContent className="border-t bg-muted/20">
                          <SalaryStatementWithLeaveReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "salary-revision" && (
                        <CardContent className="border-t bg-muted/20">
                          <SalaryRevisionReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "salary-revision-history" && (
                        <CardContent className="border-t bg-muted/20">
                          <SalaryRevisionHistoryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "payroll-cost" && (
                        <CardContent className="border-t bg-muted/20">
                          <PayrollCostSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "my-leave-summary" && (
                        <CardContent className="border-t bg-muted/20">
                          <MyLeaveSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "available-leave" && (
                        <CardContent className="border-t bg-muted/20">
                          <AvailableLeaveSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "professional-tax" && (
                        <CardContent className="border-t bg-muted/20">
                          <ProfessionalTaxReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "applied-leave" && (
                        <CardContent className="border-t bg-muted/20">
                          <AppliedLeaveSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "applied-rollover" && (
                        <CardContent className="border-t bg-muted/20">
                          <AppliedLeaveRollOverSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "applied-comp-off" && (
                        <CardContent className="border-t bg-muted/20">
                          <AppliedCompOffSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "timesheet-summary" && (
                        <CardContent className="border-t bg-muted/20">
                          <TimeSheetSummaryReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && report.id === "task-report" && (
                        <CardContent className="border-t bg-muted/20">
                          <TaskReport fromDate={fromDate} toDate={toDate} />
                        </CardContent>
                      )}

                      {isOpen && !["my-checkin-checkout", "entry-exit", "geo-checkin-checkout", "employee-attendance", "manual-entry", "grace-noncompliance", "failed-geo-fencing", "attendance-summary", "expense-column", "employee-ctc", "salary-statement", "salary-with-leave", "salary-revision", "salary-revision-history", "payroll-cost", "my-leave-summary", "available-leave", "professional-tax", "applied-leave", "applied-rollover", "applied-comp-off", "timesheet-summary", "task-report"].includes(report.id) && (

                        <CardContent className="border-t bg-muted/20 space-y-4">
                          <div className="flex flex-wrap items-center gap-2 pt-4">
                            <Button size="sm" onClick={() => handleGenerate(report.label)}>
                              Generate Report
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleExport("csv", report.label)}>
                              <Download className="h-3 w-3 mr-1" /> CSV
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleExport("excel", report.label)}>
                              <Download className="h-3 w-3 mr-1" /> Excel
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleExport("pdf", report.label)}>
                              <Download className="h-3 w-3 mr-1" /> PDF
                            </Button>
                          </div>

                          <div className="rounded-md border bg-background">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>#</TableHead>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Reference</TableHead>
                                  <TableHead>Details</TableHead>
                                  <TableHead className="text-right">Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                                    Apply filters and click <strong>Generate Report</strong> to load data
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      )}

                    </Card>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No reports match your search.</p>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
