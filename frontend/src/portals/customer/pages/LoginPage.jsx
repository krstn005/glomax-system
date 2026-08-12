import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { login } from '../../../api/auth';
import { googleLogin } from '../../../api/google';
import '../styles/auth.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = location.state?.justRegistered;
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleAuthSuccess(data) {
    localStorage.setItem('access_token', data.access);
    localStorage.setItem('refresh_token', data.refresh);
    localStorage.setItem('role', data.role);
    localStorage.setItem('username', data.username);

    if (data.role === 'CUSTOMER') {
      navigate('/dashboard');
    } else {
      setError('This portal is for Customer accounts only.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const data = await login(usernameOrEmail, password);
      handleAuthSuccess(data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Login failed. Please check your credentials and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError('');
    try {
      const data = await googleLogin(credentialResponse.credential);
      handleAuthSuccess(data);
    } catch (err) {
      console.error('Google login failed:', err);
      setError('Google sign-in failed. Please try again.');
    }
  }

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
          onClick={() => navigate('/')}
          aria-label="Back"
        >
          &#8249;
        </button>

        <div className="auth-icon-circle">&#128100;</div>
        <h1 className="auth-title">Customer Portal</h1>
        <p className="auth-subtitle">Submit requests and track your installation</p>

        <div className="auth-tabs">
          <button type="button" className="auth-tab active">
            Sign In
          </button>
          <Link to="/register" className="auth-tab">
            Register
          </Link>
        </div>

        {justRegistered && !error && (
          <div className="auth-error" style={{ background: '#e8f5e9', color: '#1b5e20' }}>
            Account created successfully! Please sign in.
          </div>
        )}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="usernameOrEmail">Email or Username</label>
            <input
              id="usernameOrEmail"
              type="text"
              className="auth-input"
              placeholder="juan@email.com"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              required
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className="auth-forgot-link">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              className="auth-input"
              placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-submit-button" disabled={isSubmitting}>
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or continue with</span>
        </div>

        <div className="auth-google-button">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google sign-in failed. Please try again.')}
            width="318"
          />
        </div>

        <div className="auth-footer-link">
          No account yet? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  );
}