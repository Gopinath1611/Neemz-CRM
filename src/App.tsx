import WorkflowEditor from "./pages/WorkflowEditor";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BranchProvider } from "@/contexts/BranchContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import CRMLayout from "./components/CRMLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Pipeline from "./pages/Pipeline";
import Contacts from "./pages/Contacts";
import CallLogs from "./pages/CallLogs";
import Messages from "./pages/Messages";
import CRMSettings from "./pages/CRMSettings";
import Inventory from "./pages/Inventory";
import Appointments from "./pages/Appointments";
import Reviews from "./pages/Reviews";
import Referrals from "./pages/Referrals";
import SocialMedia from "./pages/SocialMedia";
import WhatsAppCampaigns from "./pages/WhatsAppCampaigns";
import Analytics from "./pages/Analytics";
import LocalSEO from "./pages/LocalSEO";
import PatientRecalls from "./pages/PatientRecalls";
import ClinicWorkflow from "./pages/ClinicWorkflow";
import CurrentOralStatus from "./pages/CurrentOralStatus";
import LabOrders from "./pages/LabOrders";
import PatientEducation from "./pages/PatientEducation";
import Purchases from "./pages/Purchases";
import Expenses from "./pages/Expenses";
import DownloadReports from "./pages/DownloadReports";
import SalesMarketingDownloadReports from "./pages/reports/SalesMarketingDownloadReports";
import HRMSDownloadReports from "./pages/reports/HRMSDownloadReports";
import OperationsDownloadReports from "./pages/reports/OperationsDownloadReports";
import FinanceDownloadReports from "./pages/FinanceDownloadReports";
import Employees from "./pages/Employees";
import HRMSHome from "./pages/HRMSHome";
import EmployeeDetail from "./pages/EmployeeDetail";
import Attendance from "./pages/Attendance";
import MyAttendance from "./pages/attendance/MyAttendance";
import MyTeamAttendance from "./pages/attendance/MyTeamAttendance";
import MyShift from "./pages/attendance/MyShift";
import MyTeamShift from "./pages/attendance/MyTeamShift";
import GeoFencing from "./pages/attendance/GeoFencing";
import Payroll from "./pages/Payroll";
import PayrollDashboard from "./pages/payroll/PayrollDashboard";
import Payruns from "./pages/payroll/Payruns";
import Form16 from "./pages/payroll/Form16";

import LeaveManagement from "./pages/LeaveManagement";
import MyLeaves from "./pages/leave/MyLeaves";
import MyTeamLeaves from "./pages/leave/MyTeamLeaves";
import Holidays from "./pages/leave/Holidays";
import LeaveRollOver from "./pages/leave/LeaveRollOver";
import CompOffRequest from "./pages/leave/CompOffRequest";
import CustomizationBalance from "./pages/leave/CustomizationBalance";
import HRMSReports from "./pages/reports/HRMSReports";
import LeadGenerationReports from "./pages/reports/LeadGenerationReports";
import PeriodicReports from "./pages/reports/PeriodicReports";
import LeadAwarenessReports from "./pages/reports/LeadAwarenessReports";
import Finance from "./pages/Finance";
import CashDrawer from "./pages/CashDrawer";
import Operations from "./pages/Operations";
import Meetings from "./pages/Meetings";
import Sterilization from "./pages/Sterilization";
import WasteManagement from "./pages/WasteManagement";
import QualityControl from "./pages/QualityControl";
import ResetPassword from "./pages/ResetPassword";
import FollowUps from "./pages/FollowUps";
import LeadAutomation from "./pages/LeadAutomation";
import EmailCampaigns from "./pages/EmailCampaigns";
import WhatsAppAPI from "./pages/WhatsAppAPI";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import SMSCampaigns from "./pages/SMSCampaigns";
import IVRManagement from "./pages/IVRManagement";
import PatientDatabase from "./pages/PatientDatabase";
import NotFound from "./pages/NotFound";
import OfflineCampaigns from "./pages/OfflineCampaigns";
import Pharmacy from "./pages/Pharmacy";
import PatientPortal from "./pages/PatientPortal";
import ConnectedPlatforms from "./pages/ConnectedPlatforms";
import UserManual from "./pages/UserManual";
import CampRegister from "./pages/CampRegister";
import PendingTreatments from "./pages/PendingTreatments";
import ExternalReferrals from "./pages/ExternalReferrals";
import OrthoTreatment from "./pages/OrthoTreatment";
import ProductivityReport from "./pages/ProductivityReport";
import EMIInsurance from "./pages/EMIInsurance";
import AISmileDesign from "./pages/AISmileDesign";
import Recruitment from "./pages/Recruitment";
import Licenses from "./pages/Licenses";
import JobDescriptions from "./pages/JobDescriptions";
import Training from "./pages/Training";
import DocumentManagement from "./pages/DocumentManagement";
import Assets from "./pages/Assets";
import FYOverview from "./pages/fy/FYOverview";
import FYMonthly from "./pages/fy/FYMonthly";
import FYDepartments from "./pages/fy/FYDepartments";
import FYChair from "./pages/fy/FYChair";
import FYStaff from "./pages/fy/FYStaff";
import FYMarketing from "./pages/fy/FYMarketing";
import FYExpansion from "./pages/fy/FYExpansion";
import FYProfit from "./pages/fy/FYProfit";
import FYVariance from "./pages/fy/FYVariance";
import FYClinic from "./pages/fy/FYClinic";
import FYClinicPatient from "./pages/fy/FYClinicPatient";
import FYClinicTreatment from "./pages/fy/FYClinicTreatment";
import FYClinicChair from "./pages/fy/FYClinicChair";
import FYClinicDoctor from "./pages/fy/FYClinicDoctor";
import FYMarketingHub from "./pages/fy/FYMarketingHub";
import FYSales from "./pages/fy/FYSales";
import FYRecruitment from "./pages/fy/FYRecruitment";
import FYFinance from "./pages/fy/FYFinance";
import FYMarketingAds from "./pages/fy/FYMarketingAds";
import FYMarketingSocial from "./pages/fy/FYMarketingSocial";
import FYMarketingCamps from "./pages/fy/FYMarketingCamps";
import FYSalesTarget from "./pages/fy/FYSalesTarget";
import FYPRETarget from "./pages/fy/FYPRETarget";
import FYTreatmentTarget from "./pages/fy/FYTreatmentTarget";
import FYRecruitmentPlan from "./pages/fy/FYRecruitmentPlan";
import FYFinanceTopline from "./pages/fy/FYFinanceTopline";
import FYTreatmentRevenue from "./pages/fy/FYTreatmentRevenue";
import FYDigitalMarketingROI from "./pages/fy/FYDigitalMarketingROI";
import FYOfflineCampROI from "./pages/fy/FYOfflineCampROI";
import SystemDocumentation from "./pages/SystemDocumentation";
import AttendanceReportsSettings from "./pages/settings/hrms/AttendanceReportsSettings";
import LeaveReportsSettings from "./pages/settings/hrms/LeaveReportsSettings";
import PayrollReportsSettings from "./pages/settings/hrms/PayrollReportsSettings";
import UserActivityMonitor from "./pages/admin/UserActivityMonitor";
import InboxRequests from "./pages/hrms/InboxRequests";
import AttendanceTracker from "./pages/hrms/AttendanceTracker";
import { ActivityTrackingProvider } from "./providers/ActivityTrackingProvider";
import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BranchProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/patient-portal" element={<PatientPortal />} />
            <Route path="/camp-register/:campaignId" element={<CampRegister />} />
            <Route
              element={
                <ProtectedRoute>
                  <ActivityTrackingProvider>
                    <CRMLayout />
                  </ActivityTrackingProvider>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/clinic-workflow" element={<ClinicWorkflow />} />
              <Route path="/clinic-workflow/:patientId" element={<ClinicWorkflow />} />
              <Route path="/clinic-whatsapp/inbox" element={<WhatsAppAPI />} />
              <Route path="/clinic-whatsapp/single-send" element={<WhatsAppAPI />} />
              <Route path="/pending-treatments" element={<PendingTreatments />} />
              <Route path="/current-oral-status" element={<CurrentOralStatus />} />
              <Route path="/current-oral-status/:patientId" element={<CurrentOralStatus />} />
              <Route path="/external-referrals" element={<ExternalReferrals />} />
              <Route path="/ortho-treatment" element={<OrthoTreatment />} />
              <Route path="/emi-insurance" element={<EMIInsurance />} />
              <Route path="/ai-smile-design" element={<AISmileDesign />} />
              <Route path="/patient-database" element={<PatientDatabase />} />
              <Route path="/lab-orders" element={<LabOrders />} />
              <Route path="/pharmacy" element={<Pharmacy />} />
              <Route path="/patient-education" element={<PatientEducation />} />
              <Route path="/sterilization" element={<Sterilization />} />
              <Route path="/waste-management" element={<WasteManagement />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/followups" element={<FollowUps />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route path="/referrals" element={<Referrals />} />
              <Route path="/social-media" element={<SocialMedia />} />
              <Route path="/whatsapp" element={<WhatsAppCampaigns />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/local-seo" element={<LocalSEO />} />
              <Route path="/recalls" element={<PatientRecalls />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/reports/lead-generation" element={<LeadGenerationReports />} />
              <Route path="/reports/telecaller/periodic" element={<PeriodicReports />} />
              <Route path="/reports/lead-awareness" element={<LeadAwarenessReports />} />
              <Route path="/reports/sales-marketing/download-reports" element={<SalesMarketingDownloadReports />} />
              <Route path="/reports/hrms/download-reports" element={<HRMSDownloadReports />} />
              <Route path="/reports/operations/download-reports" element={<OperationsDownloadReports />} />
              <Route path="/download-reports" element={<DownloadReports />} />
              <Route path="/productivity-report" element={<ProductivityReport />} />
              <Route path="/finance/download-reports" element={<FinanceDownloadReports />} />
              <Route path="/call-logs" element={<CallLogs />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/settings" element={<CRMSettings />} />
              <Route path="/settings/hrms/attendance-reports" element={<AttendanceReportsSettings />} />
              <Route path="/settings/hrms/leave-reports" element={<LeaveReportsSettings />} />
              <Route path="/settings/hrms/payroll-reports" element={<PayrollReportsSettings />} />
              <Route path="/system-documentation" element={<SystemDocumentation />} />
              <Route path="/hrms/home" element={<HRMSHome />} />
              <Route path="/hrms/inbox" element={<Navigate to="/hrms/inbox/leaves" replace />} />
              <Route path="/hrms/inbox/leaves" element={<InboxRequests kind="leave" title="Leaves" emptyText="No leave requests to display" />} />
              <Route path="/hrms/inbox/comp-off" element={<InboxRequests kind="comp_off" title="Comp off request" emptyText="No comp off requests to display" />} />
              <Route path="/hrms/inbox/attendance" element={<AttendanceTracker />} />
              <Route path="/hrms/inbox/expenses" element={<InboxRequests kind="expense" title="Expenses & reimbursements" emptyText="No expense or reimbursement requests to display" />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/employees/:id" element={<EmployeeDetail />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/attendance/my" element={<MyAttendance />} />
              <Route path="/attendance/team" element={<MyTeamAttendance />} />
              <Route path="/attendance/my-shift" element={<MyShift />} />
              <Route path="/attendance/team-shift" element={<MyTeamShift />} />
              <Route path="/attendance/geo-fencing" element={<GeoFencing />} />
              <Route path="/payroll" element={<PayrollDashboard />} />
              <Route path="/payroll/payslips" element={<Payroll />} />
              <Route path="/payroll/payruns" element={<Payruns />} />
              <Route path="/payroll/form-16" element={<Form16 />} />
              
              <Route path="/leave" element={<LeaveManagement />} />
              <Route path="/leave/my" element={<MyLeaves />} />
              <Route path="/leave/team" element={<MyTeamLeaves />} />
              <Route path="/leave/holidays" element={<Holidays />} />
              <Route path="/leave/rollover" element={<LeaveRollOver />} />
              <Route path="/leave/comp-off" element={<CompOffRequest />} />
              <Route path="/leave/customization" element={<CustomizationBalance />} />
              <Route path="/hrms/reports" element={<HRMSReports />} />
              <Route path="/recruitment" element={<Recruitment />} />
              <Route path="/licenses" element={<Licenses />} />
              <Route path="/job-descriptions" element={<JobDescriptions />} />
              <Route path="/training" element={<Training />} />
              <Route path="/document-management" element={<DocumentManagement />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/cash-drawer" element={<CashDrawer />} />
              <Route path="/finance/deposits" element={<Finance />} />
              <Route path="/finance" element={<Finance />} />

              <Route path="/fy-projection" element={<Navigate to="/fy-projection/overview" replace />} />
              <Route path="/fy-projection/overview" element={<FYOverview />} />
              <Route path="/fy-projection/monthly" element={<FYMonthly />} />
              <Route path="/fy-projection/departments" element={<FYDepartments />} />
              <Route path="/fy-projection/chair" element={<FYChair />} />
              <Route path="/fy-projection/staff" element={<FYStaff />} />
              <Route path="/fy-projection/marketing" element={<FYMarketing />} />
              <Route path="/fy-projection/expansion" element={<FYExpansion />} />
              <Route path="/fy-projection/profit" element={<FYProfit />} />
              <Route path="/fy-projection/variance" element={<FYVariance />} />
              <Route path="/fy-projection/clinic" element={<Navigate to="/fy-projection/clinic/patient" replace />} />
              <Route path="/fy-projection/clinic/patient" element={<FYClinicPatient />} />
              <Route path="/fy-projection/clinic/treatment" element={<FYClinicTreatment />} />
              <Route path="/fy-projection/clinic/chair" element={<FYClinicChair />} />
              <Route path="/fy-projection/clinic/doctor" element={<FYClinicDoctor />} />
              <Route path="/fy-projection/clinic-tabs" element={<FYClinic />} />
              <Route path="/fy-projection/marketing-hub" element={<Navigate to="/fy-projection/marketing/ads" replace />} />
              <Route path="/fy-projection/marketing-hub/tabs" element={<FYMarketingHub />} />
              <Route path="/fy-projection/marketing/ads" element={<FYMarketingAds />} />
              <Route path="/fy-projection/marketing/social" element={<FYMarketingSocial />} />
              <Route path="/fy-projection/marketing/camps" element={<FYMarketingCamps />} />
              <Route path="/fy-projection/sales" element={<Navigate to="/fy-projection/sales/target" replace />} />
              <Route path="/fy-projection/sales/tabs" element={<FYSales />} />
              <Route path="/fy-projection/sales/target" element={<FYSalesTarget />} />
              <Route path="/fy-projection/sales/pre" element={<FYPRETarget />} />
              <Route path="/fy-projection/sales/treatment" element={<FYTreatmentTarget />} />
              <Route path="/fy-projection/recruitment-plan" element={<Navigate to="/fy-projection/recruitment/plan" replace />} />
              <Route path="/fy-projection/recruitment-plan/tabs" element={<FYRecruitment />} />
              <Route path="/fy-projection/recruitment/plan" element={<FYRecruitmentPlan />} />
              <Route path="/fy-projection/finance" element={<Navigate to="/fy-projection/finance/topline" replace />} />
              <Route path="/fy-projection/finance/tabs" element={<FYFinance />} />
              <Route path="/fy-projection/finance/topline" element={<FYFinanceTopline />} />
              <Route path="/fy-projection/finance/treatment-revenue" element={<FYTreatmentRevenue />} />
              <Route path="/fy-projection/finance/digital-roi" element={<FYDigitalMarketingROI />} />
              <Route path="/fy-projection/finance/offline-roi" element={<FYOfflineCampROI />} />
              <Route path="/fy-projection/finance/gross" element={<Navigate to="/fy-projection/finance/treatment-revenue" replace />} />
              <Route path="/fy-projection/finance/net" element={<Navigate to="/fy-projection/finance/offline-roi" replace />} />
              <Route path="/operations" element={<Operations />} />
              <Route path="/meetings" element={<Meetings />} />
              <Route path="/quality-control" element={<QualityControl />} />
              <Route path="/lead-automation" element={<LeadAutomation />} />
              <Route path="/automation-email" element={<EmailCampaigns />} />
              <Route path="/automation-whatsapp" element={<WhatsAppAPI />} />
              <Route path="/automation-workflow" element={<WorkflowBuilder />} />
              <Route path="/automation-workflow/new" element={<WorkflowEditor />} />
              <Route path="/automation-workflow/edit/:id" element={<WorkflowEditor />} />
              <Route path="/automation-sms" element={<SMSCampaigns />} />
              <Route path="/automation-ivr" element={<IVRManagement />} />
              <Route path="/offline-campaigns" element={<OfflineCampaigns />} />
              <Route path="/connected-platforms" element={<ConnectedPlatforms />} />
              <Route path="/user-manual" element={<UserManual />} />
              <Route path="/user-activity-monitor" element={<UserActivityMonitor />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BranchProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
