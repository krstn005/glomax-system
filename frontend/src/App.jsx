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
    </Routes>
  );
}
