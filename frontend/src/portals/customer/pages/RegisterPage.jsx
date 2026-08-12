import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { register } from '../../../api/auth';
import { googleLogin } from '../../../api/google';
import '../styles/auth.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    email: '',
    phone_number: '',
    address: '',
    password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(form);
      // NOTE: The Figma design routes to an OTP verification screen here,
      // but SMS/email verification (Semaphore) is intentionally deferred
      // for now - accounts activate immediately, so we go straight to
      // Login with a success message instead.
      navigate('/login', { state: { justRegistered: true } });
    } catch (err) {
      const data = err.response?.data;
      if (data) {
        const firstError = Object.values(data)[0];
        setError(Array.isArray(firstError) ? firstError[0] : String(firstError));
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError('');
    try {
      const data = await googleLogin(credentialResponse.credential);
      localStorage.setItem('access_token', data.access);
      localStorage.setItem('refresh_token', data.refresh);
      localStorage.setItem('role', data.role);
      localStorage.setItem('username', data.username);
      navigate('/dashboard');
    } catch (err) {
      console.error('Google sign-up failed:', err);
      setError('Google sign-up failed. Please try again.');
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
          <Link to="/login" className="auth-tab">
            Sign In
          </Link>
          <button type="button" className="auth-tab active">
            Register
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="username">Full Name</label>
            <input
              id="username"
              name="username"
              type="text"
              className="auth-input"
              placeholder="Juan Dela Cruz"
              value={form.username}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              className="auth-input"
              placeholder="juan@email.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="phone_number">Phone Number</label>
            <input
              id="phone_number"
              name="phone_number"
              type="tel"
              className="auth-input"
              placeholder="09171234567"
              value={form.phone_number}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="address">Address</label>
            <input
              id="address"
              name="address"
              type="text"
              className="auth-input"
              placeholder="123 Rizal St, Quezon City"
              value={form.address}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="auth-input"
              placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="confirm_password">Confirm Password</label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              className="auth-input"
              placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
              value={form.confirm_password}
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="auth-submit-button" disabled={isSubmitting}>
            {isSubmitting ? 'Creating Account...' : 'Register'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <div className="auth-google-button">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google sign-up failed. Please try again.')}
            width="318"
            text="signup_with"
          />
        </div>

        <div className="auth-footer-link">
          Already have an account? <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
}