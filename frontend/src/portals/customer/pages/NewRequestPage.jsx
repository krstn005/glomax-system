import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  User,
  Sun,
  BatteryCharging,
  ClipboardCheck,
  AlertTriangle,
  Copy,
  Phone,
  MapPin,
  CalendarDays,
  Package,
  Zap,
  Bell,
  Info,
  ArrowRight,
  ArrowLeft,
  FileText,
  LayoutDashboard,
  Send,
  PlusCircle,
  RotateCcw,
} from 'lucide-react';
import apiClient from '../../../api/client';
import { createTicket, getMyTickets, reapplyTicket } from '../../../api/tickets';
import { sanitizePhoneNumber } from '../../../utils/phone';
import { formatCurrency } from '../../../utils/currency';
import { getServerErrorMessage } from '../../../utils/profileHelpers';
import VisitCalendar, { toDateKey } from '../../../components/VisitCalendar';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/new-request.css';

// ⚠️ Verify these match your real pricing.PriceHistory active prices
const PACKAGES = [
  { id: '3kw-ongrid', label: '3KW On-Grid', tag: 'On-Grid', desc: 'Residential Starter — Ideal for small households', price: 106000, systemType: 'ON_GRID' },
  { id: '6kw-ongrid', label: '6KW On-Grid', tag: 'On-Grid', desc: 'Residential Standard — Perfect for medium households', price: 155000, systemType: 'ON_GRID' },
  { id: '8kw-ongrid', label: '8KW On-Grid', tag: 'On-Grid', desc: 'Residential Large — For bigger homes with high energy use', price: 205000, systemType: 'ON_GRID' },
  { id: '10kw-ongrid', label: '10KW On-Grid', tag: 'On-Grid', desc: 'Commercial Starter — Best for small commercial properties', price: 245000, systemType: 'ON_GRID' },
  { id: '3kw-hybrid', label: '3KW Hybrid', tag: 'Hybrid', desc: 'Residential with Backup — Works during power outages', price: 215000, systemType: 'HYBRID' },
  { id: '6kw-hybrid', label: '6KW Hybrid', tag: 'Hybrid', desc: 'Residential Premium — Best for homes needing backup power', price: 260000, systemType: 'HYBRID' },
  { id: '8kw-hybrid', label: '8KW Hybrid', tag: 'Hybrid', desc: 'Large Residential Hybrid — High-capacity backup system', price: 335000, systemType: 'HYBRID' },
  { id: '10kw-hybrid', label: '10KW Hybrid', tag: 'Hybrid', desc: 'Commercial Premium — For large homes or businesses', price: 375000, systemType: 'HYBRID' },
];

const PACKAGE_GROUPS = [
  {
    systemType: 'ON_GRID',
    title: 'On-Grid',
    note: 'Connected to the utility grid. Most affordable option.',
    icon: Sun,
  },
  {
    systemType: 'HYBRID',
    title: 'Hybrid',
    note: 'Grid + battery backup. Keeps working during power outages.',
    icon: BatteryCharging,
  },
];

const STEPS = ['Your Information', 'Package & System', 'Confirmation'];

const RESOLVED_STATUSES = ['APPROVED', 'COMPLETED', 'WITHDRAWN', 'NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'];

// A ticket in one of these can be reapplied - the same ticket (and the
// same reference number) is used again instead of making a new one
const REAPPLY_STATUSES = ['WITHDRAWN', 'NC_CAN_REAPPLY'];

function canReapply(ticket) {
  if (!ticket) return false;
  return typeof ticket.can_reapply === 'boolean' ? ticket.can_reapply : REAPPLY_STATUSES.includes(ticket.status);
}

// Finds the package card that matches a saved package name,
// like "6KW Hybrid" or "8KW On-Grid"
function findPackageId(name) {
  const clean = (v) => (v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = clean(name);
  if (!target) return '';
  const match = PACKAGES.find((p) => clean(p.label) === target);
  return match ? match.id : '';
}

// Same colours as the Dashboard and the other portals
const STATUS_TONE = {
  REQUEST_SUBMITTED: 'navy',
  APPROVED: 'green',
  COMPLETED: 'done',
  WITHDRAWN: 'gray',
  NC_CANNOT_PROCEED: 'red',
  NC_CAN_REAPPLY: 'red',
};

// Philippine mobile number: 11 digits starting with 09
const PH_MOBILE = /^09\d{9}$/;

function tomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateKey(d);
}

function formatKey(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="nr-section-title">
      <span className="nr-section-icon">
        <Icon size={16} />
      </span>
      <h2>{children}</h2>
    </div>
  );
}

function SummaryField({ icon: Icon, label, value }) {
  return (
    <div className="nr-summary-field">
      <span className="nr-summary-icon">
        <Icon size={15} />
      </span>
      <div className="nr-summary-text">
        <p className="nr-summary-label">{label}</p>
        <p className="nr-summary-value">{value}</p>
      </div>
    </div>
  );
}

// Navy banner. While filling in the form, the 3 steps show inside it.
// When reapplying, it says which ticket is being used again.
function PageHeading({ step = 0, reapplyFrom = null }) {
  const showSteps = step >= 1 && step <= 3;
  return (
    <section className="nr-hero">
      <div className="nr-hero-glow" aria-hidden="true" />
      <div className="nr-hero-top">
        <div className="nr-hero-icon">
          {reapplyFrom ? <RotateCcw size={26} /> : <PlusCircle size={26} />}
        </div>
        <div className="nr-hero-text">
          <h1>{reapplyFrom ? 'Reapply' : 'New Request'}</h1>
          <p>
            {reapplyFrom
              ? `Send your request again using the same reference number, ${reapplyFrom.ticket_number}`
              : 'Submit a new solar installation schedule request'}
          </p>
        </div>
        {showSteps && (
          <span className="nr-hero-count">
            Step <strong>{step}</strong> of {STEPS.length}
          </span>
        )}
      </div>

      {showSteps && (
        <ol className="nr-stepper" aria-label="Request steps">
          {STEPS.map((label, i) => {
            const num = i + 1;
            let state = 'todo';
            if (num < step) state = 'done';
            if (num === step) state = 'current';
            return (
              <li key={label} className={`nr-stepper-step ${state}`}>
                <span className="nr-stepper-circle">{state === 'done' ? <Check size={15} /> : num}</span>
                <span className="nr-stepper-label">{label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// Shown when the customer already has a request in progress.
// Wide layout: message on the left, request preview on the right.
function ActiveRequestBlocked({ ticket, onViewStatus, onDashboard }) {
  return (
    <div className="nr-blocked">
      <div className="nr-blocked-body">
        <div className="nr-blocked-message">
          <span className="nr-blocked-icon">
            <AlertTriangle size={24} />
          </span>
          <h2>You already have an active request</h2>
          <p>
            You can only have one request in progress at a time. You can submit a new one once
            this request is completed, withdrawn, or marked Not Compatible.
          </p>

          {ticket.status === 'REQUEST_SUBMITTED' && (
            <div className="nr-blocked-tip">
              <Info size={16} />
              <p>
                Need to change something? You can withdraw this request from your Dashboard, then
                submit a new one.
              </p>
            </div>
          )}
        </div>

        <div className="nr-blocked-ticket">
          <div className="nr-blocked-ticket-head">
            <div className="nr-blocked-ticket-id">
              <span className="nr-blocked-ticket-icon">
                <FileText size={16} />
              </span>
              <div>
                <p className="nr-blocked-ticket-label">Active Request</p>
                <p className="nr-blocked-ticket-number">{ticket.ticket_number}</p>
              </div>
            </div>
            <span className={`nr-status tone-${STATUS_TONE[ticket.status] || 'blue'}`}>
              {ticket.status_display}
            </span>
          </div>

          <div className="nr-blocked-ticket-list">
            <SummaryField icon={CalendarDays} label="Submitted" value={formatDate(ticket.created_at)} />
            <SummaryField icon={Package} label="Package" value={ticket.solar_package || '—'} />
            <SummaryField icon={MapPin} label="Address" value={ticket.property_address || '—'} />
          </div>
        </div>
      </div>

      <div className="nr-blocked-actions">
        <button type="button" className="nr-pill-secondary" onClick={onDashboard}>
          <LayoutDashboard size={16} />
          Back to Dashboard
        </button>
        <button type="button" className="nr-pill-primary" onClick={onViewStatus}>
          View Request Status
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default function NewRequestPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checkingActive, setCheckingActive] = useState(true);
  const [activeTicket, setActiveTicket] = useState(null);
  // The old ticket being used again (Withdrawn or Not Compatible - Can Reapply)
  const [reapplyFrom, setReapplyFrom] = useState(null);
  const [dateCleared, setDateCleared] = useState(false);
  const [result, setResult] = useState({ reapplied: false, attempt: 1 });

  const [step, setStep] = useState(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [phoneWarning, setPhoneWarning] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [copyState, setCopyState] = useState('idle'); // idle | copied | failed
  const [prefilled, setPrefilled] = useState(false);

  const [form, setForm] = useState({
    fullName: '',
    contactNumber: '',
    address: '',
    preferredDate: '',
    packageId: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function checkActive() {
      try {
        const tickets = await getMyTickets();
        if (cancelled) return;
        const found = tickets.find((t) => !RESOLVED_STATUSES.includes(t.status));
        setActiveTicket(found || null);
        if (!found) pickReapplyTicket(tickets);
      } catch {
        // If this check fails, don't block the form - the backend
        // still enforces this rule on submit either way.
        setActiveTicket(null);
      } finally {
        if (!cancelled) setCheckingActive(false);
      }
    }

    // Reapply: use the ticket from the link (?reapply=ID), or else the
    // customer's latest ticket if it can be reapplied. Its details are
    // filled in, and the customer can change anything.
    function pickReapplyTicket(tickets) {
      const wantedId = searchParams.get('reapply');
      const newestFirst = [...tickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const fromLink = wantedId ? tickets.find((t) => String(t.id) === wantedId) : null;
      const source = canReapply(fromLink) ? fromLink : canReapply(newestFirst[0]) ? newestFirst[0] : null;
      if (!source) return;

      // An old preferred date that has already passed can't be used again
      const oldDate = (source.preferred_date || '').slice(0, 10);
      const dateStillOk = oldDate && oldDate >= tomorrowKey();
      setDateCleared(Boolean(oldDate) && !dateStillOk);

      setReapplyFrom(source);
      setForm((prev) => ({
        ...prev,
        fullName: source.full_name || prev.fullName,
        contactNumber: source.contact_number || prev.contactNumber,
        address: source.property_address || prev.address,
        preferredDate: dateStillOk ? oldDate : '',
        packageId: findPackageId(source.solar_package) || prev.packageId,
      }));
    }

    // Fill in phone and address from the customer's profile, so they
    // don't have to type them again. They can still change them.
    async function prefillFromProfile() {
      try {
        const res = await apiClient.get('/accounts/me/');
        if (cancelled) return;
        const phone = res.data.phone_number || '';
        const address = res.data.address || '';
        if (phone || address) setPrefilled(true);
        setForm((prev) => ({
          ...prev,
          contactNumber: prev.contactNumber || phone,
          address: prev.address || address,
        }));
      } catch {
        // Not important - the customer can just type them in.
      }
    }

    checkActive();
    prefillFromProfile();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the "Submit Request?" popup with the Esc key
  useEffect(() => {
    if (!showConfirm) return undefined;
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) setShowConfirm(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showConfirm, submitting]);

  const selectedPackage = PACKAGES.find((p) => p.id === form.packageId);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handlePhoneChange(e) {
    const { value, hadInvalidChar } = sanitizePhoneNumber(e.target.value);
    updateField('contactNumber', value);
    setPhoneWarning(hadInvalidChar ? 'Phone Number can only contain numbers.' : '');
  }

  function goToStep2(e) {
    e.preventDefault();
    const errors = {};
    if (!form.fullName.trim()) errors.fullName = 'Please enter your full name.';
    if (!PH_MOBILE.test(form.contactNumber.replace(/\D/g, ''))) {
      errors.contactNumber = 'Please enter an 11-digit mobile number starting with 09.';
    }
    if (!form.address.trim()) errors.address = 'Please enter your address.';
    if (!form.preferredDate) errors.preferredDate = 'Please pick a preferred date.';

    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) setStep(2);
  }

  function goToStep3() {
    if (!form.packageId) return;
    setStep(3);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        full_name: form.fullName.trim(),
        property_address: form.address.trim(),
        contact_number: form.contactNumber.replace(/\D/g, ''),
        preferred_date: form.preferredDate,
        solar_package: selectedPackage.label,
        system_type: selectedPackage.systemType,
      };
      // Reapply uses the same ticket. A normal submit can still reuse the
      // latest ticket on the server side - "reapplied" tells us if it did.
      const data = reapplyFrom ? await reapplyTicket(reapplyFrom.id, payload) : await createTicket(payload);
      setTicketNumber(data.ticket_number);
      setResult({ reapplied: Boolean(data.reapplied || reapplyFrom), attempt: data.attempt_number || 1 });
      window.dispatchEvent(new Event('customer-tickets-changed'));
      setShowConfirm(false);
      setStep(4); // success screen
    } catch (err) {
      setSubmitError(getServerErrorMessage(err, 'Something went wrong submitting your request. Please try again.'));
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyTicket() {
    try {
      await navigator.clipboard.writeText(ticketNumber);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 2000);
  }

  if (checkingActive) {
    return (
      <CustomerLayout>
        <div className="nr-page">
          <PageHeading />
          <div className="nr-card nr-card-skeleton">
            <span className="nr-skel nr-skel-title" />
            <span className="nr-skel nr-skel-field" />
            <span className="nr-skel nr-skel-field" />
            <span className="nr-skel nr-skel-field" />
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (activeTicket) {
    return (
      <CustomerLayout>
        <div className="nr-page">
          <PageHeading />
          <ActiveRequestBlocked
            ticket={activeTicket}
            onViewStatus={() => navigate('/request-status')}
            onDashboard={() => navigate('/dashboard')}
          />
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="nr-page">
        <PageHeading step={step} reapplyFrom={reapplyFrom} />

        {/* Step 1: Your Information */}
        {step === 1 && (
          <div className="nr-card">
            <SectionTitle icon={User}>Your Information</SectionTitle>

            {reapplyFrom && (
              <div className="nr-reapply-note">
                <span className="nr-reapply-icon">
                  <RotateCcw size={16} />
                </span>
                <div>
                  <p className="nr-reapply-title">
                    Reapplying with {reapplyFrom.ticket_number}
                    <span className={`nr-status tone-${STATUS_TONE[reapplyFrom.status] || 'blue'}`}>
                      {reapplyFrom.status_display}
                    </span>
                  </p>
                  <p>
                    We filled in your details from your last try. Change anything you need. You'll keep the same
                    reference number, and your last try is saved in its history.
                    {dateCleared && ' Your old preferred date has passed, so please pick a new one.'}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={goToStep2} noValidate>
              <div className="nr-info-layout">
                <div className="nr-info-fields">
                  <div className="nr-field">
                    <label htmlFor="nr-name">Full Name *</label>
                    <div className={`nr-input-wrap ${fieldErrors.fullName ? 'has-error' : ''}`}>
                      <User size={16} />
                      <input
                        id="nr-name"
                        type="text"
                        placeholder="Juan Dela Cruz"
                        value={form.fullName}
                        onChange={(e) => updateField('fullName', e.target.value)}
                      />
                    </div>
                    {fieldErrors.fullName && <p className="nr-field-error">{fieldErrors.fullName}</p>}
                  </div>

                  <div className="nr-field">
                    <label htmlFor="nr-phone">Phone Number *</label>
                    <div className={`nr-input-wrap ${fieldErrors.contactNumber ? 'has-error' : ''}`}>
                      <Phone size={16} />
                      <input
                        id="nr-phone"
                        type="tel"
                        inputMode="numeric"
                        placeholder="09123456789"
                        maxLength={11}
                        value={form.contactNumber}
                        onChange={handlePhoneChange}
                      />
                    </div>
                    {phoneWarning && <p className="nr-field-error">{phoneWarning}</p>}
                    {!phoneWarning && fieldErrors.contactNumber && (
                      <p className="nr-field-error">{fieldErrors.contactNumber}</p>
                    )}
                    {!phoneWarning && !fieldErrors.contactNumber && (
                      <p className="nr-field-hint">11 digits, starts with 09</p>
                    )}
                  </div>

                  <div className="nr-field">
                    <label htmlFor="nr-address">Property Address *</label>
                    <div className={`nr-input-wrap nr-input-wrap-textarea ${fieldErrors.address ? 'has-error' : ''}`}>
                      <MapPin size={16} />
                      <textarea
                        id="nr-address"
                        rows={3}
                        placeholder="House no., street, barangay, city"
                        value={form.address}
                        onChange={(e) => updateField('address', e.target.value)}
                      />
                    </div>
                    {fieldErrors.address && <p className="nr-field-error">{fieldErrors.address}</p>}
                  </div>

                  <div className="nr-tip">
                    <span className="nr-tip-icon">
                      <Info size={16} />
                    </span>
                    <div>
                      <p className="nr-tip-title">Good to know</p>
                      <ul>
                        {prefilled && !reapplyFrom && (
                          <li>We filled in your phone and address from your profile. You can change them here.</li>
                        )}
                        <li>A Partner Installer will visit on or close to your preferred date.</li>
                        <li>You'll get a notification once your visit is confirmed.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="nr-info-date">
                  <p className="nr-field-title">Preferred Visit Date *</p>
                  <p className="nr-field-hint nr-date-hint">Pick any day starting tomorrow.</p>
                  <VisitCalendar
                    value={form.preferredDate}
                    onChange={(key) => updateField('preferredDate', key)}
                    minDate={tomorrowKey()}
                  />
                  {fieldErrors.preferredDate && <p className="nr-field-error">{fieldErrors.preferredDate}</p>}
                </div>
              </div>

              <div className="nr-actions nr-actions-right">
                <button type="submit" className="nr-btn-primary">
                  Continue
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 2: Package & System */}
        {step === 2 && (
          <div className="nr-card">
            <SectionTitle icon={Package}>Preferred Package</SectionTitle>
            <p className="nr-hint">
              Pick the package you're interested in. The system type is set automatically from your choice.
            </p>

            {PACKAGE_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.systemType} className="nr-package-group">
                  <div className="nr-group-head">
                    <span className={`nr-group-icon ${group.systemType === 'HYBRID' ? 'hybrid' : 'ongrid'}`}>
                      <GroupIcon size={16} />
                    </span>
                    <div>
                      <p className="nr-group-title">{group.title}</p>
                      <p className="nr-group-note">{group.note}</p>
                    </div>
                  </div>

                  <div className="nr-package-grid">
                    {PACKAGES.filter((p) => p.systemType === group.systemType).map((pkg) => {
                      const isSelected = form.packageId === pkg.id;
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          className={`nr-package-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => updateField('packageId', pkg.id)}
                        >
                          {isSelected && (
                            <span className="nr-package-check">
                              <Check size={12} />
                            </span>
                          )}
                          <span className="nr-package-name">{pkg.label}</span>
                          <span className="nr-package-desc">{pkg.desc}</span>
                          <span className="nr-package-price">{formatCurrency(pkg.price)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="nr-actions">
              <button type="button" className="nr-btn-secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} />
                Back
              </button>
              <p className={`nr-picked ${selectedPackage ? 'on' : ''}`}>
                {selectedPackage ? (
                  <>
                    <span className="nr-picked-label">Selected</span>
                    <strong>{selectedPackage.label}</strong>
                    <span className="nr-picked-price">{formatCurrency(selectedPackage.price)}</span>
                  </>
                ) : (
                  'Pick a package to continue'
                )}
              </p>
              <button
                type="button"
                className="nr-btn-primary"
                disabled={!form.packageId}
                onClick={goToStep3}
              >
                Continue
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {step === 3 && selectedPackage && (
          <div className="nr-card">
            <SectionTitle icon={ClipboardCheck}>Confirm Your Request</SectionTitle>

            <div className="nr-summary-grid">
              <SummaryField icon={User} label="Full Name" value={form.fullName} />
              <SummaryField icon={Phone} label="Phone Number" value={form.contactNumber} />
              <SummaryField icon={MapPin} label="Property Address" value={form.address} />
              <SummaryField icon={CalendarDays} label="Preferred Visit Date" value={formatKey(form.preferredDate)} />
              <SummaryField icon={Package} label="Preferred Package" value={selectedPackage.label} />
              <SummaryField icon={Zap} label="System Type" value={selectedPackage.tag} />
            </div>

            <div className="nr-price-box">
              <span>Package Price</span>
              <strong>{formatCurrency(selectedPackage.price)}</strong>
            </div>

            <div className="nr-notice">
              <Bell size={16} />
              <p>
                You'll get updates about this request in your notifications. Our team will review
                it within 1-2 business days.
              </p>
            </div>

            {submitError && (
              <p className="nr-submit-error">
                <AlertTriangle size={15} />
                {submitError}
              </p>
            )}

            <div className="nr-actions">
              <button type="button" className="nr-btn-secondary" onClick={() => setStep(2)}>
                <ArrowLeft size={16} />
                Back
              </button>
              <button type="button" className="nr-btn-gold" onClick={() => setShowConfirm(true)}>
                {reapplyFrom ? <RotateCcw size={16} /> : <Send size={16} />}
                {reapplyFrom ? 'Reapply Now' : 'Submit Request'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="nr-center-card">
            <div className="nr-center-icon">
              <Check size={30} />
            </div>
            <h2>{result.reapplied ? 'Request Reapplied!' : 'Request Submitted!'}</h2>
            <p className="nr-center-sub">
              {result.reapplied ? 'You are still using the same reference number:' : 'Your request reference number is:'}
            </p>
            <div className="nr-ticket-box">
              <span className="nr-ticket-number">{ticketNumber}</span>
              <button type="button" className="nr-copy-btn" onClick={handleCopyTicket}>
                {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
                {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? "Couldn't copy" : 'Copy'}
              </button>
            </div>
            {result.reapplied && result.attempt > 1 && (
              <p className="nr-center-try">This is try {result.attempt} for this request.</p>
            )}
            <p>Our team will review your request and contact you within 1-2 business days.</p>
            <div className="nr-center-actions">
              <button type="button" className="nr-btn-secondary" onClick={() => navigate('/dashboard')}>
                <LayoutDashboard size={16} />
                Back to Dashboard
              </button>
              <button type="button" className="nr-btn-primary" onClick={() => navigate('/request-status')}>
                View Status
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Submit confirmation popup */}
      {showConfirm && (
        <div className="nr-modal-overlay" onClick={() => !submitting && setShowConfirm(false)}>
          <div className="nr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="nr-modal-icon">
              <ClipboardCheck size={22} />
            </div>
            <h3>{reapplyFrom ? 'Reapply?' : 'Submit Request?'}</h3>
            <p>
              {reapplyFrom
                ? `This sends ${reapplyFrom.ticket_number} again with the details you entered. Our team will review it again from the start.`
                : 'Are you sure you want to submit this request? Once submitted, our team will begin reviewing it.'}
            </p>
            <div className="nr-modal-actions">
              <button
                type="button"
                className="nr-btn-secondary"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="button" className="nr-btn-gold" disabled={submitting} onClick={handleSubmit}>
                {submitting ? 'Sending...' : reapplyFrom ? 'Reapply' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerLayout>
  );
}