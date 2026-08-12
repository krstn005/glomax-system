import { useNavigate } from 'react-router-dom';
import '../styles/auth.css';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-icon">G</div>
        <span className="auth-brand-name">Glomax Solar Enterprises</span>
      </div>

      <div className="auth-card">
        <button
          type="button"
          className="auth-back-button"
          onClick={() => navigate('/login')}
          aria-label="Back"
        >
          &#8249;
        </button>

        <div className="auth-icon-circle">&#128274;</div>
        <h1 className="auth-title">Forgot Password?</h1>
        <p className="auth-subtitle">
          Password reset via SMS is coming soon. Please contact support for
          help accessing your account in the meantime.
        </p>

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