import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './portals/customer/pages/LandingPage';
import LoginPage from './portals/customer/pages/LoginPage';
import RegisterPage from './portals/customer/pages/RegisterPage';
import ForgotPasswordPage from './portals/customer/pages/ForgotPasswordPage';
import DashboardPage from './portals/customer/pages/DashboardPage';
import NewRequestPage from './portals/customer/pages/NewRequestPage';
import RequestStatusPage from './portals/customer/pages/RequestStatusPage';
import PastRequestsPage from './portals/customer/pages/PastRequestsPage';
import FeedbackPage from './portals/customer/pages/FeedbackPage';
import SettingsPage from './portals/customer/pages/SettingsPage';
import PortalLoginPage from './portals/shared/pages/PortalLoginPage';
import ProtectedRoute from './portals/shared/components/ProtectedRoute';
import StaffDashboardPage from './portals/staff/pages/StaffDashboardPage';
import StaffSettingsPage from './portals/staff/pages/StaffSettingsPage';
import StaffEmailInquiriesPage from './portals/staff/pages/StaffEmailInquiriesPage';
import AdminDashboardPage from './portals/admin/pages/AdminDashboardPage';
import PIDashboardPage from './portals/partner-installer/pages/PIDashboardPage';
import StaffInquiryQuotationPage from './portals/staff/pages/StaffInquiryQuotationPage';
import StaffQuotationManagementPage from './portals/staff/pages/StaffQuotationManagementPage';
import StaffManageTicketsPage from './portals/staff/pages/StaffManageTicketsPage';
import StaffTicketDetailPage from './portals/staff/pages/StaffTicketDetailPage';
import StaffQuotationDetailPage from './portals/staff/pages/StaffQuotationDetailPage';
import StaffAssessmentReviewPage from './portals/staff/pages/StaffAssessmentReviewPage';
import StaffAssessmentDetailPage from './portals/staff/pages/StaffAssessmentDetailPage';
import StaffCompletedTicketsPage from './portals/staff/pages/StaffCompletedTicketsPage';
import StaffCompletedTicketDetailPage from './portals/staff/pages/StaffCompletedTicketDetailPage';
import StaffActivePricesPage from './portals/staff/pages/StaffActivePricesPage';
import StaffPriceHistoryPage from './portals/staff/pages/StaffPriceHistoryPage';
import StaffPaymentTermsHistoryPage from './portals/staff/pages/StaffPaymentTermsHistoryPage';
import InquiryReplyPage from './portals/shared/pages/InquiryReplyPage';
function isLoggedIn() {
  return Boolean(localStorage.getItem('access_token'));
}

function RequireAuth({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Customer portal */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/new-request"
        element={
          <RequireAuth>
            <NewRequestPage />
          </RequireAuth>
        }
      />
      <Route
        path="/request-status"
        element={
          <RequireAuth>
            <RequestStatusPage />
          </RequireAuth>
        }
      />
      <Route
        path="/past-requests"
        element={
          <RequireAuth>
            <PastRequestsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/feedback"
        element={
          <RequireAuth>
            <FeedbackPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />

      {/* Public, no-login page - opened from the Reply Link inside
          Staff's quotation/reply emails. Not part of any portal, not
          protected - anyone with a valid access_token link can view
          and reply to their own inquiry's conversation thread here. */}
      <Route path="/inquiry-reply/:token" element={<InquiryReplyPage />} />

      {/* Per-role login pages for Staff, Admin, and Partner Installer */}
      <Route path="/staff-login" element={<PortalLoginPage role="STAFF" />} />
      <Route path="/admin-login" element={<PortalLoginPage role="ADMIN" />} />
      <Route
        path="/partner-installer-login"
        element={<PortalLoginPage role="PARTNER_INSTALLER" />}
      />

      {/* Staff portal */}
      <Route
        path="/staff/dashboard"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/settings"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/email-inquiries"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffEmailInquiriesPage />
          </ProtectedRoute>
        }
      />

      {/* Admin portal */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRole="ADMIN">
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Partner Installer portal */}
      <Route
        path="/partner-installer/dashboard"
        element={
          <ProtectedRoute allowedRole="PARTNER_INSTALLER">
            <PIDashboardPage />
          </ProtectedRoute>
        }
      />

      {/* Staff Inquiry Quotation */}
      <Route
        path="/staff/email-inquiries/:id/quotation"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffInquiryQuotationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/quotations"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffQuotationManagementPage />
          </ProtectedRoute>
        }
      />
      {/* Manage Tickets (list + detail) */}
      <Route
        path="/staff/manage-tickets"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffManageTicketsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/manage-tickets/:id"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffTicketDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/quotations/:id"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffQuotationDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/assessment-review"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffAssessmentReviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/assessment-review/:id"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffAssessmentDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/completed-tickets"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffCompletedTicketsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/completed-tickets/:id"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffCompletedTicketDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/active-prices"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffActivePricesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/price-history"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffPriceHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/staff/payment-terms-history"
        element={
          <ProtectedRoute allowedRole="STAFF">
            <StaffPaymentTermsHistoryPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}