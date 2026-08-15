import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTicket } from '../../../api/tickets';
import { sanitizePhoneNumber } from '../../../utils/phone';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/new-request.css';

// ⚠️ Verify these match your real pricing.PriceHistory active prices
const PACKAGES = [
  { id: '3kw-ongrid', label: '3KW On-Grid', tag: 'On-Grid', desc: 'Residential Starter — Ideal for small households', price: 106000, systemType: 'On-Grid' },
  { id: '6kw-ongrid', label: '6KW On-Grid', tag: 'On-Grid', desc: 'Residential Standard — Perfect for medium households', price: 155000, systemType: 'On-Grid' },
  { id: '8kw-ongrid', label: '8KW On-Grid', tag: 'On-Grid', desc: 'Residential Large — For bigger homes with high energy use', price: 205000, systemType: 'On-Grid' },
  { id: '10kw-ongrid', label: '10KW On-Grid', tag: 'On-Grid', desc: 'Commercial Starter — Best for small commercial properties', price: 245000, systemType: 'On-Grid' },
  { id: '3kw-hybrid', label: '3KW Hybrid', tag: 'Hybrid', desc: 'Residential with Backup — Works during power outages', price: 215000, systemType: 'Hybrid' },
  { id: '6kw-hybrid', label: '6KW Hybrid', tag: 'Hybrid', desc: 'Residential Premium — Best for homes needing backup power', price: 260000, systemType: 'Hybrid' },
  { id: '8kw-hybrid', label: '8KW Hybrid', tag: 'Hybrid', desc: 'Large Residential Hybrid — High-capacity backup system', price: 335000, systemType: 'Hybrid' },
  { id: '10kw-hybrid', label: '10KW Hybrid', tag: 'Hybrid', desc: 'Commercial Premium — For large homes or businesses', price: 375000, systemType: 'Hybrid' },
];

export default function NewRequestPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [phoneWarning, setPhoneWarning] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    contactNumber: '',
    address: '',
    packageId: '',
  });

  const selectedPackage = PACKAGES.find((p) => p.id === form.packageId);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePhoneChange(e) {
    const { value, hadInvalidChar } = sanitizePhoneNumber(e.target.value);
    updateField('contactNumber', value);
    setPhoneWarning(hadInvalidChar ? 'Phone Number can only contain numbers.' : '');
  }

  function goToStep2(e) {
    e.preventDefault();
    setStep(2);
  }

  function goToStep3() {
    if (!form.packageId) return;
    setStep(3);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const data = await createTicket({
        property_address: form.address,
        contact_number: form.contactNumber,
        solar_package: selectedPackage.label,
        system_type: selectedPackage.systemType,
      });
      setTicketNumber(data.ticket_number);
      setShowConfirm(false);
      setStep(4); // success screen
    } catch  {
      setSubmitError('Something went wrong submitting your request. Please try again.');
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CustomerLayout>
      <div className="nr-heading">
        <h1>New Request</h1>
        <p>Submit a new solar installation schedule request</p>
      </div>

      {step < 4 && (
        <div className="nr-steps">
          {['Your Information', 'Package & System', 'Confirmation'].map((label, i) => {
            const num = i + 1;
            const state = num < step ? 'done' : num === step ? 'active' : 'pending';
            return (
              <div key={label} className="nr-step-wrap">
                <div className={`nr-step-circle ${state}`}>
                  {state === 'done' ? '✓' : num}
                </div>
                <span className={`nr-step-label ${state === 'pending' ? '' : 'nr-step-label-active'}`}>
                  {label}
                </span>
                {num < 3 && <div className={`nr-step-line ${num < step ? 'done' : ''}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Step 1: Your Information */}
      {step === 1 && (
        <div className="nr-card">
          <h2>Your Information</h2>
          <form onSubmit={goToStep2}>
            <div className="nr-field">
              <label>Full Name *</label>
              <input
                type="text"
                placeholder="Juan Dela Cruz"
                value={form.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                required
              />
            </div>
            <div className="nr-field">
              <label>Phone Number *</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="0012 3456 780"
                value={form.contactNumber}
                onChange={handlePhoneChange}
                required
              />
              {phoneWarning && <p className="nr-field-warning">{phoneWarning}</p>}
            </div>
            <div className="nr-field">
              <label>Address *</label>
              <input
                type="text"
                placeholder="123 Rizal St, Quezon City"
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                required
              />
            </div>
            <div className="nr-actions nr-actions-right">
              <button type="submit" className="nr-btn-primary">Continue</button>
            </div>
          </form>
        </div>
      )}

      {/* Step 2: Package & System */}
      {step === 2 && (
        <div className="nr-card">
          <h2>Preferred Package & System Type</h2>
          <p className="nr-field-label-top">Preferred Package *</p>
          <div className="nr-package-grid">
            {PACKAGES.map((pkg) => (
              <button
                key={pkg.id}
                type="button"
                className={`nr-package-card ${form.packageId === pkg.id ? 'selected' : ''}`}
                onClick={() => updateField('packageId', pkg.id)}
              >
                <div className="nr-package-top">
                  <span className="nr-package-name">{pkg.label}</span>
                  <span className={`nr-package-tag ${pkg.tag === 'Hybrid' ? 'tag-hybrid' : 'tag-ongrid'}`}>
                    {pkg.tag}
                  </span>
                </div>
                <p className="nr-package-desc">{pkg.desc}</p>
                <p className="nr-package-price">₱{pkg.price.toLocaleString()}</p>
              </button>
            ))}
          </div>

          <p className="nr-field-label-top">System Type *</p>
          <div className="nr-system-grid">
            <div className="nr-system-card">
              <h3>On-Grid</h3>
              <p>Connected to the utility grid. Most affordable option.</p>
            </div>
            <div className="nr-system-card">
              <h3>Hybrid</h3>
              <p>Grid + battery backup. Works during outages.</p>
            </div>
          </div>

          <div className="nr-actions">
            <button type="button" className="nr-btn-secondary" onClick={() => setStep(1)}>Back</button>
            <button
              type="button"
              className="nr-btn-primary"
              disabled={!form.packageId}
              onClick={goToStep3}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 3 && selectedPackage && (
        <div className="nr-card">
          <h2>Confirm Your Request</h2>
          <div className="nr-confirm-table">
            <div className="nr-confirm-row">
              <span>Full Name</span>
              <strong>{form.fullName}</strong>
            </div>
            <div className="nr-confirm-row">
              <span>Phone Number</span>
              <strong>{form.contactNumber}</strong>
            </div>
            <div className="nr-confirm-row">
              <span>Address</span>
              <strong>{form.address}</strong>
            </div>
            <div className="nr-confirm-row">
              <span>Preferred Package</span>
              <strong>{selectedPackage.label}</strong>
            </div>
            <div className="nr-confirm-row">
              <span>Package Price</span>
              <strong>₱{selectedPackage.price.toLocaleString()}</strong>
            </div>
            <div className="nr-confirm-row">
              <span>System Type</span>
              <strong>{selectedPackage.systemType}</strong>
            </div>
          </div>

          <div className="nr-notice">
            An SMS confirmation will be sent to your Phone Number upon submission. Our team will review your request within 1-2 business days.
          </div>

          {submitError && <div className="nr-error">{submitError}</div>}

          <div className="nr-actions">
            <button type="button" className="nr-btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="nr-btn-primary" onClick={() => setShowConfirm(true)}>
              Submit Request
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && (
        <div className="nr-success-card">
          <div className="nr-success-icon">✓</div>
          <h2>Request Submitted!</h2>
          <p>Your request reference number is:</p>
          <p className="nr-ticket-number">{ticketNumber}</p>
          <p className="nr-success-sub">
            Our team will review your request and contact you within 1-2 business days.
          </p>
          <div className="nr-actions nr-actions-center">
            <button className="nr-btn-primary" onClick={() => navigate('/request-status')}>
              View Status
            </button>
            <button className="nr-btn-secondary" onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Submit confirmation popup */}
      {showConfirm && (
        <div className="nr-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="nr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Submit Request?</h3>
            <p>
              Are you sure you want to submit this request? Once submitted, our team will begin reviewing it.
            </p>
            <div className="nr-modal-actions">
              <button className="nr-btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="nr-btn-primary" disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}