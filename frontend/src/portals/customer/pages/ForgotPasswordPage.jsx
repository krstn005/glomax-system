import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  Sun,
  Home,
  Activity,
  FileText,
  MessageSquareText,
  Clock,
  ShieldCheck,
  Info,
} from 'lucide-react';
import logo from '../../../assets/images/logo.jpg';
import '../styles/customer-login.css';

const FEATURES = [
  { icon: Home, label: 'Request a free roof check' },
  { icon: Activity, label: 'Track your installation step by step' },
  { icon: FileText, label: 'Get quotations and documents online' },
];

const HELP_STEPS = [
  { icon: MessageSquareText, text: 'Contact Glomax using the contact form on our home page.' },
  { icon: ShieldCheck, text: 'Give the email or phone number you used to register.' },
  { icon: Clock, text: "We'll help you get back into your account as soon as we can." },
];

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  return (
    <div className="cl-page">
      {/* Left: brand panel */}
      <aside className="cl-brand">
        <div className="cl-brand-glow" aria-hidden="true" />
        <div className="cl-brand-grid" aria-hidden="true" />

        <div className="cl-brand-top">
          <span className="cl-logo-ring">
            <img src={logo} alt="Glomax Solar Enterprises" />
          </span>
          <div>
            <p className="cl-brand-name">Glomax Solar</p>
            <p className="cl-brand-sub">Enterprises</p>
          </div>
        </div>

        <div className="cl-brand-body">
          <span className="cl-portal-pill">
            <Sun size={14} />
            Customer Portal
          </span>
          <h2 className="cl-brand-headline">We're here to help</h2>
          <p className="cl-brand-text">
            Locked out? No worries. Your requests, quotations, and documents are safe in your account.
          </p>

          <ul className="cl-features">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label}>
                <span className="cl-feature-icon">
                  <Icon size={16} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="cl-brand-foot">© {new Date().getFullYear()} Glomax Solar Enterprises</p>
      </aside>

      {/* Right: help card */}
      <main className="cl-main">
        <Link to="/login" className="cl-back">
          <ArrowLeft size={15} />
          Back to Sign In
        </Link>

        <div className="cl-card">
          <div className="cl-card-head">
            <span className="cl-role-badge">
              <KeyRound size={22} />
            </span>
            <div>
              <h1 className="cl-title">Forgot your password?</h1>
              <p className="cl-subtitle">Here's how to get back in</p>
            </div>
          </div>

          <div className="cl-info">
            <Info size={16} />
            <span>
              <strong>Password reset by SMS is coming soon.</strong> For now, our team can help you reset it.
            </span>
          </div>

          <ol className="cl-steps">
            {HELP_STEPS.map(({ icon: Icon, text }, i) => (
              <li key={text}>
                <span className="cl-step-num">{i + 1}</span>
                <span className="cl-step-icon">
                  <Icon size={16} />
                </span>
                <span className="cl-step-text">{text}</span>
              </li>
            ))}
          </ol>

          <button type="button" className="cl-submit cl-full" onClick={() => navigate('/login')}>
            Back to Sign In
            <ArrowRight size={17} />
          </button>

          <button type="button" className="cl-btn-secondary cl-full" onClick={() => navigate('/')}>
            Go to home page
          </button>

          <p className="cl-register">
            Don't have an account yet? <Link to="/register">Create one</Link>
          </p>
        </div>

        <p className="cl-footer">Glomax Solar Enterprises · Customer Portal</p>
      </main>
    </div>
  );
}