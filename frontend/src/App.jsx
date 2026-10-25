import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

import LandingPage from './portals/customer/pages/LandingPage';
import LoginPage from './portals/customer/pages/LoginPage';
import RegisterPage from './portals/customer/pages/RegisterPage';
import ForgotPasswordPage from './portals/customer/pages/ForgotPasswordPage';
import DashboardPage from './portals/customer/pages/DashboardPage';
import NewRequestPage from './portals/customer/pages/NewRequestPage';
import RequestStatusPage from './portals/customer/pages/RequestStatusPage';
import PastRequestsPage from './portals/customer/pages/PastRequestsPage';
import DocumentsPage from './portals/customer/pages/DocumentsPage';
import FeedbackPage from './portals/customer/pages/FeedbackPage';
import FaqPage from './portals/customer/pages/FaqPage';
import SettingsPage from './portals/customer/pages/SettingsPage';
import InquiryReplyPage from './portals/shared/pages/InquiryReplyPage';

import StaffDashboardPage from './portals/staff/pages/StaffDashboardPage';
import StaffEmailInquiriesPage from './portals/staff/pages/StaffEmailInquiriesPage';
import StaffInquiryQuotationPage from './portals/staff/pages/StaffInquiryQuotationPage';
import StaffQuotationManagementPage from './portals/staff/pages/StaffQuotationManagementPage';
import StaffManageTicketsPage from './portals/staff/pages/StaffManageTicketsPage';
import StaffAssessmentReviewPage from './portals/staff/pages/StaffAssessmentReviewPage';
import StaffAssessmentDetailPage from './portals/staff/pages/StaffAssessmentDetailPage';
import StaffCompletedTicketsPage from './portals/staff/pages/StaffCompletedTicketsPage';
import StaffCompletedTicketDetailPage from './portals/staff/pages/StaffCompletedTicketDetailPage';
import StaffTicketDetailPage from './portals/staff/pages/StaffTicketDetailPage';
import StaffCalendarPage from './portals/staff/pages/StaffCalendarPage';
import StaffActivePricesPage from './portals/staff/pages/StaffActivePricesPage';
import StaffPriceHistoryPage from './portals/staff/pages/StaffPriceHistoryPage';
import StaffPaymentTermsHistoryPage from './portals/staff/pages/StaffPaymentTermsHistoryPage';
import StaffSettingsPage from './portals/staff/pages/StaffSettingsPage';

import PIDashboardPage from './portals/partner-installer/pages/PIDashboardPage';
import PIIncomingTicketsPage from './portals/partner-installer/pages/PIIncomingTicketsPage';
import PIAssessmentSheetPage from './portals/partner-installer/pages/PIAssessmentSheetPage';
import PITicketHistoryPage from './portals/partner-installer/pages/PITicketHistoryPage';
import PIMyRatingsPage from './portals/partner-installer/pages/PIMyRatingsPage';
import PISettingsPage from './portals/partner-installer/pages/PISettingsPage';
import PICalendarPage from './portals/partner-installer/pages/PICalendarPage';

import AdminDashboardPage from './portals/admin/pages/AdminDashboardPage';
import AdminRequestsPage from './portals/admin/pages/AdminRequestsPage';
import AdminCompletedTicketsPage from './portals/admin/pages/AdminCompletedTicketsPage';
import AdminTicketDetailPage from './portals/admin/pages/AdminTicketDetailPage';
import AdminWorkersPage from './portals/admin/pages/AdminWorkersPage';
import AdminPriceHistoryPage from './portals/admin/pages/AdminPriceHistoryPage';
import AdminPaymentTermsHistoryPage from './portals/admin/pages/AdminPaymentTermsHistoryPage';
import AdminActivePricesPage from './portals/admin/pages/AdminActivePricesPage';
import AdminCustomersLogPage from './portals/admin/pages/AdminCustomersLogPage';
import AdminReportsPage from './portals/admin/pages/AdminReportsPage';
import AdminCustomerFeedbackPage from './portals/admin/pages/AdminCustomerFeedbackPage';
import AdminSettingsPage from './portals/admin/pages/AdminSettingsPage';

// The old staff. / installer. / admin. addresses just forward to the one login page
const OLD_PORTAL_HOSTS = ['staff.', 'installer.', 'admin.'];
function forwardOldAddress() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (!OLD_PORTAL_HOSTS.some((h) => host.startsWith(h)) || host.endsWith('localhost')) return false;
  window.location.replace(`https://${host.replace(/^(staff|installer|admin)\./, '')}/login`);
  return true;
}

function App() {
  if (forwardOldAddress()) return null;
  return (
    <Routes>
      {/* Public - one login page for every role */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Public - the full conversation page for an inquiry. The link in the
          reply email and in the customer's bell notification both open this. */}
      <Route path="/inquiry-reply/:token" element={<InquiryReplyPage />} />

      {/* Old login addresses now go to the one login page */}
      <Route path="/staff-login" element={<Navigate to="/login" replace />} />
      <Route path="/admin-login" element={<Navigate to="/login" replace />} />
      <Route path="/partner-installer-login" element={<Navigate to="/login" replace />} />

      {/* Protected - Customer only */}
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["CUSTOMER"]}><DashboardPage /></ProtectedRoute>} />
      <Route path="/new-request" element={<ProtectedRoute allowedRoles={["CUSTOMER"]}><NewRequestPage /></ProtectedRoute>} />
      <Route path="/request-status" element={<ProtectedRoute allowedRoles={["CUSTOMER"]}><RequestStatusPage /></ProtectedRoute>} />
      <Route path="/past-requests" element={<ProtectedRoute allowedRoles={["CUSTOMER"]}><PastRequestsPage /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute allowedRoles={["CUSTOMER"]}><DocumentsPage /></ProtectedRoute>} />
      <Route path="/feedback" element={<ProtectedRoute allowedRoles={["CUSTOMER"]}><FeedbackPage /></ProtectedRoute>} />
      <Route path="/faqs" element={<FaqPage />} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={["CUSTOMER"]}><SettingsPage /></ProtectedRoute>} />

      {/* Protected - Staff only */}
      <Route path="/staff/dashboard" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffDashboardPage /></ProtectedRoute>} />
      <Route path="/staff/email-inquiries" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffEmailInquiriesPage /></ProtectedRoute>} />
      <Route path="/staff/email-inquiries/:id/quotation" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffInquiryQuotationPage /></ProtectedRoute>} />
      <Route path="/staff/quotation-management" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffQuotationManagementPage /></ProtectedRoute>} />
      <Route path="/staff/manage-tickets" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffManageTicketsPage /></ProtectedRoute>} />
      <Route path="/staff/manage-tickets/:id" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffTicketDetailPage /></ProtectedRoute>} />
      <Route path="/staff/assessment-review" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffAssessmentReviewPage /></ProtectedRoute>} />
      <Route path="/staff/assessment-review/:id" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffAssessmentDetailPage /></ProtectedRoute>} />
      <Route path="/staff/completed-tickets" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffCompletedTicketsPage /></ProtectedRoute>} />
      <Route path="/staff/completed-tickets/:id" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffCompletedTicketDetailPage /></ProtectedRoute>} />
      <Route path="/staff/calendar" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffCalendarPage /></ProtectedRoute>} />
      <Route path="/staff/active-prices" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffActivePricesPage /></ProtectedRoute>} />
      <Route path="/staff/price-history" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffPriceHistoryPage /></ProtectedRoute>} />
      <Route path="/staff/payment-terms-history" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffPaymentTermsHistoryPage /></ProtectedRoute>} />
      <Route path="/staff/settings" element={<ProtectedRoute allowedRoles={["STAFF"]}><StaffSettingsPage /></ProtectedRoute>} />

      {/* Protected - Partner Installer only */}
      <Route path="/partner-installer/dashboard" element={<ProtectedRoute allowedRoles={["PARTNER_INSTALLER"]}><PIDashboardPage /></ProtectedRoute>} />
      <Route path="/partner-installer/incoming-tickets" element={<ProtectedRoute allowedRoles={["PARTNER_INSTALLER"]}><PIIncomingTicketsPage /></ProtectedRoute>} />
      <Route path="/partner-installer/incoming-tickets/:id" element={<ProtectedRoute allowedRoles={["PARTNER_INSTALLER"]}><PIAssessmentSheetPage /></ProtectedRoute>} />
      <Route path="/partner-installer/ticket-history" element={<ProtectedRoute allowedRoles={["PARTNER_INSTALLER"]}><PITicketHistoryPage /></ProtectedRoute>} />
      <Route path="/partner-installer/my-ratings" element={<ProtectedRoute allowedRoles={["PARTNER_INSTALLER"]}><PIMyRatingsPage /></ProtectedRoute>} />
      <Route path="/partner-installer/settings" element={<ProtectedRoute allowedRoles={["PARTNER_INSTALLER"]}><PISettingsPage /></ProtectedRoute>} />
      <Route path="/partner-installer/calendar" element={<PICalendarPage />} />

      {/* Protected - Admin only */}
      <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminDashboardPage /></ProtectedRoute>} />
      <Route path="/admin/requests" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminRequestsPage /></ProtectedRoute>} />
      <Route path="/admin/requests/:id" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminTicketDetailPage /></ProtectedRoute>} />
      <Route path="/admin/completed-tickets" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminCompletedTicketsPage /></ProtectedRoute>} />
      <Route path="/admin/workers" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminWorkersPage /></ProtectedRoute>} />
      <Route path="/admin/price-history" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminPriceHistoryPage /></ProtectedRoute>} />
      <Route path="/admin/payment-terms-history" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminPaymentTermsHistoryPage /></ProtectedRoute>} />
      <Route path="/admin/active-prices" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminActivePricesPage /></ProtectedRoute>} />
      <Route path="/admin/customers-log" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminCustomersLogPage /></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminReportsPage /></ProtectedRoute>} />
      <Route path="/admin/customer-feedback" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminCustomerFeedbackPage /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["ADMIN"]}><AdminSettingsPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;