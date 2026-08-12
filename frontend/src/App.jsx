import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './portals/customer/pages/LandingPage';
import LoginPage from './portals/customer/pages/LoginPage';
import RegisterPage from './portals/customer/pages/RegisterPage';
import ForgotPasswordPage from './portals/customer/pages/ForgotPasswordPage';
import DashboardPage from './portals/customer/pages/DashboardPage';

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
    </Routes>
  );
}