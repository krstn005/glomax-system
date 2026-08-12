import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Lock } from 'lucide-react';
import logo from '../../../assets/images/logo.jpg';
import '../styles/auth.css';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <img src={logo} alt="Glomax Solar Enterprises" className="auth-brand-logo" />
        <span className="auth-brand-name">Glomax Solar Enterprises</span>
      </div>

      <div className="auth-card">
        <div className="auth-back-row">
          <button
            type="button"
            className="auth-back-button"
            onClick={() => navigate('/login')}
            aria-label="Back"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <div className="auth-header">
          <div className="auth-icon-circle">
            <Lock size={22} />
          </div>
          <h1 className="auth-title">Forgot Password?</h1>
          <p className="auth-subtitle">
            Password reset via SMS is coming soon. Please contact support for
            help accessing your account in the meantime.
          </p>
        </div>

        <button
          type="button"
          className="auth-submit-button"
          onClick={() => navigate('/login')}
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}