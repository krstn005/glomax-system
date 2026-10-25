import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileCheck,
  MapPin,
  X,
  CheckCircle,
  Clock,
  Hourglass,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Award,
  ClipboardList,
  ClipboardCheck,
  Home,
  Zap,
  Ruler,
  LayoutGrid,
  Cpu,
  Camera,
  ImagePlus,
  MessageSquareText,
  Send,
  AlertCircle,
  SearchX,
  Hammer,
  Phone,
  CalendarDays,
  Navigation,
  Circle,
  ChevronRight,
  Plus,
  AlertTriangle,
  History,
  RotateCcw,
  Save,
} from 'lucide-react';
import PILayout from '../components/PILayout';
import { getInstallerTickets, submitAssessment, completeInstallation } from '../../../api/piTickets';
import '../styles/pi-assessment-sheet.css';

const ROOF_TYPE_OPTIONS = [
  { value: 'CONCRETE', label: 'Concrete' },
  { value: 'METAL', label: 'Metal' },
  { value: 'SHINGLE', label: 'Shingle' },
  { value: 'TILE', label: 'Tile' },
  { value: 'OTHER', label: 'Other' },
];

const ROOF_CONDITION_OPTIONS = [
  { value: 'GOOD', label: 'Good', tone: 'green' },
  { value: 'FAIR', label: 'Fair', tone: 'gold' },
  { value: 'POOR', label: 'Poor', tone: 'red' },
];

const SYSTEM_TYPE_OPTIONS = [
  { value: 'ON_GRID', label: 'On-Grid' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const SYSTEM_TYPE_LABELS = { ON_GRID: 'On-Grid', HYBRID: 'Hybrid' };

// Same package sizes the company sells
const PACKAGE_SIZES = [3, 6, 8, 10];

const PROOF_MIN = 1;
const PROOF_MAX = 2;
const NOTES_MAX = 500;

// Badge look for each ticket status
const STATUS_BADGE = {
  PI_ASSIGNED: { tone: 'gold', icon: Clock },
  ASSESSMENT_SUBMITTED: { tone: 'blue', icon: Hourglass },
  STAFF_REVIEW: { tone: 'blue', icon: Hourglass },
  ADMIN_REVIEW: { tone: 'blue', icon: Hourglass },
  APPROVED: { tone: 'green', icon: CheckCircle2 },
  COMPLETED: { tone: 'green', icon: Award },
  NC_CANNOT_PROCEED: { tone: 'red', icon: XCircle },
  NC_CAN_REAPPLY: { tone: 'red', icon: XCircle },
  WITHDRAWN: { tone: 'gray', icon: MinusCircle },
};

const CONDITION_TONE = { GOOD: 'green', FAIR: 'gold', POOR: 'red' };

// Reads "YYYY-MM-DD" as a local date. new Date("2026-09-17") would be
// read as UTC, which can show the wrong day in the Philippines.
function parseLocalDate(value) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(value) {
  const date = parseLocalDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function visitHint(ticket) {
  const date = parseLocalDate(ticket.visit_date);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return { text: 'Visit today', tone: 'soon' };
  if (diff === 1) return { text: 'Tomorrow', tone: 'soon' };
  if (diff > 1) return { text: `In ${diff} days`, tone: '' };
  if (ticket.status === 'PI_ASSIGNED') return { text: 'Overdue', tone: 'late' };
  return null;
}

// Starts the form on the customer's own choice, e.g. "10KW Hybrid"
function buildStartForm(ticket) {
  const match = (ticket.solar_package || '').match(/(\d+)\s*kw/i);
  const kw = match && PACKAGE_SIZES.includes(Number(match[1])) ? match[1] : '';
  const system = ticket.system_type === 'HYBRID' ? 'HYBRID' : 'ON_GRID';
  return {
    estimated_roof_area_sqm: '',
    roof_type: 'CONCRETE',
    roof_condition: 'GOOD',
    package_kw: kw,
    recommended_system_type: system,
    rated_capacity_kw: kw,
    number_of_solar_panels: '',
    inverter_size_kw: '',
    notes: '',
  };
}

// ---------- Draft saving ----------
// While the Partner Installer fills in the sheet, what they typed (and
// their Proof of Visit photos) is saved in this browser. If the page
// closes by accident (tab closed, phone restarted, signal lost, signed
// out), the sheet comes back the way they left it when they open it again.
// It uses the browser's IndexedDB, not localStorage, because signing out
// clears localStorage, and IndexedDB can also hold the photos.

const DRAFT_DB = 'glomax-drafts';
const DRAFT_STORE = 'assessment-sheets';
const DRAFT_MAX_AGE_DAYS = 30;
const DRAFT_SAVE_DELAY = 600; // ms after the last change

function openDraftDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('Drafts are not supported in this browser.'));
      return;
    }
    const request = window.indexedDB.open(DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DRAFT_STORE)) {
        request.result.createObjectStore(DRAFT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Runs one read or write on the drafts store, then closes it
async function runDraftStore(mode, action) {
  const db = await openDraftDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, mode);
      const request = action(tx.objectStore(DRAFT_STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// One draft per ticket per account, so two installers on the same
// computer never see each other's drafts
function draftKey(ticketId) {
  let user = '';
  try {
    user = localStorage.getItem('username') || '';
  } catch {
    user = '';
  }
  return `${user || 'installer'}:${ticketId}`;
}

async function loadDraft(ticketId) {
  try {
    const draft = await runDraftStore('readonly', (store) => store.get(draftKey(ticketId)));
    if (!draft || !draft.form) return null;
    const ageDays = (Date.now() - (draft.savedAt || 0)) / 86400000;
    if (ageDays > DRAFT_MAX_AGE_DAYS) {
      clearDraft(ticketId);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

async function saveDraft(ticketId, form, photos) {
  const draft = {
    form,
    photos: photos.map((p) => ({ file: p.file, name: p.name })),
    savedAt: Date.now(),
  };
  try {
    await runDraftStore('readwrite', (store) => store.put(draft, draftKey(ticketId)));
    return draft.savedAt;
  } catch {
    // Storage full or photos can't be stored: keep at least the typed fields
    try {
      await runDraftStore('readwrite', (store) => store.put({ ...draft, photos: [] }, draftKey(ticketId)));
      return draft.savedAt;
    } catch {
      return null;
    }
  }
}

async function clearDraft(ticketId) {
  try {
    await runDraftStore('readwrite', (store) => store.delete(draftKey(ticketId)));
  } catch {
    // Nothing to clear
  }
}

// Puts a saved draft on top of the starting form. Only known fields are
// used, so an old draft can never add strange values.
function mergeDraftForm(startForm, savedForm) {
  const merged = { ...startForm };
  Object.keys(startForm).forEach((key) => {
    if (typeof savedForm?.[key] === 'string') merged[key] = savedForm[key];
  });
  if (merged.package_kw && !PACKAGE_SIZES.includes(Number(merged.package_kw))) merged.package_kw = '';
  if (!SYSTEM_TYPE_LABELS[merged.recommended_system_type]) merged.recommended_system_type = startForm.recommended_system_type;
  merged.notes = merged.notes.slice(0, NOTES_MAX);
  return merged;
}

// Has anything been typed or added since the sheet first opened?
function hasChanges(form, startForm, photos) {
  if (photos.length > 0) return true;
  return Object.keys(startForm).some((key) => form[key] !== startForm[key]);
}

function formatSavedTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `today at ${time}`;
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

// The kW number from the customer's package, e.g. "10KW Hybrid" -> "10"
function customerPackageKw(ticket) {
  const match = (ticket.solar_package || '').match(/(\d+)\s*kw/i);
  return match ? match[1] : '';
}

function getErrorMessage(err, fallback) {
  const data = err?.response?.data;
  const detail = data?.detail || Object.values(data || {})[0] || fallback;
  return Array.isArray(detail) ? detail[0] : detail;
}

function getInitials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || '';
  return (first + last).toUpperCase();
}

function isPositive(value) {
  return Number(value) > 0;
}

function SectionTitle({ icon: Icon, step, tone = 'navy', title, subtitle, done }) {
  return (
    <div className="pias-section-title">
      {step ? (
        <span className={`pias-step-badge ${done ? 'done' : ''}`}>
          {done ? <CheckCircle2 size={18} /> : step}
        </span>
      ) : (
        <span className={`pias-section-icon tone-${tone}`}>
          <Icon size={18} />
        </span>
      )}
      <div className="pias-section-text">
        {step && <span className="pias-step-kicker">Step {step} of 3</span>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {step && (
        <span className={`pias-step-state ${done ? 'done' : ''}`}>
          {done ? <CheckCircle2 size={13} /> : <Circle size={13} />}
          {done ? 'Done' : 'To do'}
        </span>
      )}
    </div>
  );
}

// Progress row under the header: one stop per checklist item
function StepTracker({ checks, onJump, savedAt, saving }) {
  const doneCount = checks.filter((c) => c.done).length;
  const percent = Math.round((doneCount / checks.length) * 100);
  return (
    <div className="pias-card pias-tracker">
      <div className="pias-tracker-head">
        <div>
          <p className="pias-side-label">Your progress</p>
          <p className="pias-tracker-title">
            {doneCount === checks.length
              ? 'Everything is filled in. You can submit now.'
              : `${doneCount} of ${checks.length} parts done`}
          </p>
          {(saving || savedAt) && (
            <p className={`pias-draft-saved ${saving ? 'busy' : ''}`} aria-live="polite">
              <Save size={13} />
              {saving ? 'Saving draft...' : `Draft saved ${formatSavedTime(savedAt)}`}
            </p>
          )}
        </div>
        <span className={`pias-tracker-percent ${doneCount === checks.length ? 'ready' : ''}`}>{percent}%</span>
      </div>
      <ol className="pias-tracker-steps">
        {checks.map((c, i) => (
          <li key={c.key} className={c.done ? 'done' : ''}>
            <button type="button" onClick={() => onJump(c.target)}>
              <span className="pias-tracker-dot">{c.done ? <CheckCircle2 size={16} /> : i + 1}</span>
              <span className="pias-tracker-label">{c.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({ label, value, tone }) {
  return (
    <div className="pias-field">
      <span className="pias-field-label">{label}</span>
      <span className="pias-field-value">
        {tone && <span className={`pias-dot tone-${tone}`} />}
        {value || '—'}
      </span>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, unit }) {
  return (
    <div className="pias-stat">
      <span className="pias-stat-icon">
        <Icon size={17} />
      </span>
      <span className="pias-stat-label">{label}</span>
      <span className="pias-stat-value">
        {value ?? '—'}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}

function UnitInput({ id, icon: Icon, unit, ...inputProps }) {
  return (
    <div className="pias-input-wrap">
      <Icon size={16} />
      <input id={id} {...inputProps} />
      {unit && <span className="pias-unit">{unit}</span>}
    </div>
  );
}

function ChipGroup({ options, value, onChange, name }) {
  return (
    <div className="pias-chips" role="radiogroup" aria-label={name}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`pias-chip ${selected ? 'selected' : ''} ${opt.tone ? `tone-${opt.tone}` : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {selected && <CheckCircle2 size={14} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Big tiles for the package size. The customer's own pick gets a small tag.
function PackagePicker({ value, onChange, customerKw }) {
  return (
    <div className="pias-packages" role="radiogroup" aria-label="Recommended Package">
      {PACKAGE_SIZES.map((kw) => {
        const key = String(kw);
        const selected = value === key;
        return (
          <button
            key={kw}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`pias-package ${selected ? 'selected' : ''}`}
            onClick={() => onChange(key)}
          >
            <span className="pias-package-kw">
              {kw}
              <small>KW</small>
            </span>
            {customerKw === key && <span className="pias-package-tag">Customer's pick</span>}
            {selected && <CheckCircle2 size={16} className="pias-package-check" />}
          </button>
        );
      })}
    </div>
  );
}

// Photo upload: one big box when empty, then thumbnails with an "add" tile
function PhotoPicker({ items, max, min, onAdd, onRemove, onPreview, hint }) {
  const inputRef = useRef(null);
  const full = max && items.length >= max;
  const openPicker = () => inputRef.current?.click();

  return (
    <div className="pias-photos">
      {items.length === 0 ? (
        <button type="button" className="pias-dropzone" onClick={openPicker}>
          <span className="pias-dropzone-icon">
            <ImagePlus size={22} />
          </span>
          <span className="pias-dropzone-title">Add photos</span>
          <span className="pias-dropzone-hint">{hint}</span>
        </button>
      ) : (
        <div className="pias-photo-grid">
          {items.map((p, i) => (
            <div key={p.url} className="pias-photo-thumb">
              <button type="button" className="pias-photo-open" onClick={() => onPreview(p.url)} aria-label="View photo">
                <img src={p.url} alt={p.name} />
              </button>
              <button type="button" className="pias-photo-remove" onClick={() => onRemove(i)} aria-label="Remove photo">
                <X size={13} />
              </button>
            </div>
          ))}
          {!full && (
            <button type="button" className="pias-photo-add" onClick={openPicker}>
              <Plus size={20} />
              <span>Add more</span>
            </button>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="pias-file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length) onAdd(files);
        }}
      />

      <p className={`pias-photo-count ${items.length >= min ? 'ok' : ''}`}>
        {items.length >= min ? <CheckCircle2 size={14} /> : <Camera size={14} />}
        {items.length} {max ? `of ${max}` : ''} photo{items.length === 1 ? '' : 's'} added
        {items.length < min && ` · at least ${min} needed`}
      </p>
    </div>
  );
}

function PhotoGallery({ photos, alt, onPreview }) {
  return (
    <div className="pias-photo-grid">
      {photos.map((photo) => (
        <button
          key={photo.id}
          type="button"
          className="pias-photo-thumb clickable"
          onClick={() => onPreview(photo.image)}
        >
          <img src={photo.image} alt={alt} />
        </button>
      ))}
    </div>
  );
}

function ConfirmModal({ icon: Icon, tone, title, message, confirmLabel, busyLabel, busy, onCancel, onConfirm }) {
  return (
    <div className="pias-modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="pias-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`pias-modal-icon tone-${tone}`}>
          <Icon size={22} />
        </div>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="pias-modal-actions">
          <button type="button" className="pias-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pias-btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerCard({ ticket, customerName }) {
  const address = ticket.property_address;
  const mapsUrl = address
    ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address)
    : null;

  return (
    <div className="pias-card pias-customer-card">
      <p className="pias-side-label">Customer</p>
      <div className="pias-customer-head">
        <span className="pias-avatar">{getInitials(customerName)}</span>
        <div className="pias-customer-text">
          <p className="pias-customer-name">{customerName}</p>
          {ticket.contact_number ? (
            <a href={`tel:${ticket.contact_number}`} className="pias-customer-phone">
              <Phone size={13} />
              {ticket.contact_number}
            </a>
          ) : (
            <p className="pias-customer-sub">No contact number</p>
          )}
        </div>
      </div>

      <div className="pias-address">
        <MapPin size={16} />
        <div>
          <span className="pias-field-label">Address</span>
          <p>{address || 'No address given'}</p>
        </div>
      </div>
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="pias-directions">
          <Navigation size={14} />
          Get Directions
        </a>
      )}

      <div className="pias-customer-grid">
        <Field label="Preferred Package" value={ticket.solar_package} />
        <Field label="Preferred System" value={SYSTEM_TYPE_LABELS[ticket.system_type]} />
      </div>
    </div>
  );
}

function ChecklistCard({ checks, error, submitting, onJump }) {
  const doneCount = checks.filter((c) => c.done).length;
  const allDone = doneCount === checks.length;

  return (
    <div className={`pias-card pias-check-card ${allDone ? 'ready' : ''}`}>
      <div className="pias-check-head">
        <p className="pias-side-label">Before you submit</p>
        <span className={`pias-check-pill ${allDone ? 'ready' : ''}`}>
          {allDone ? 'Ready to submit' : `${doneCount} of ${checks.length} done`}
        </span>
      </div>

      <div className="pias-check-bar" aria-hidden="true">
        <span style={{ width: `${(doneCount / checks.length) * 100}%` }} />
      </div>

      <ul className="pias-check-list">
        {checks.map((c) => (
          <li key={c.key}>
            <button type="button" className={`pias-check-item ${c.done ? 'done' : ''}`} onClick={() => onJump(c.target)}>
              {c.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              <span className="pias-check-text">
                <span className="pias-check-label">{c.label}</span>
                <span className="pias-check-sub">{c.sub}</span>
              </span>
              <ChevronRight size={15} className="pias-check-arrow" />
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p className="pias-notice red">
          <AlertCircle size={15} />
          <span>{error}</span>
        </p>
      )}

      <button type="submit" form="pias-assess-form" className="pias-btn-primary pias-submit" disabled={submitting}>
        <Send size={15} />
        {submitting ? 'Submitting...' : 'Review and Submit'}
      </button>
      <p className="pias-check-foot">You can't edit the assessment after it's sent to Staff.</p>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="pias-stack">
      <div className="pias-hero">
        <span className="pias-skel pias-skel-dark pias-skel-back" />
        <div className="pias-skel-stack pias-skel-grow">
          <span className="pias-skel pias-skel-dark pias-skel-w-sm" />
          <span className="pias-skel pias-skel-dark pias-skel-w-lg" />
          <span className="pias-skel pias-skel-dark pias-skel-w-md" />
        </div>
      </div>
      <div className="pias-layout">
        <div className="pias-main">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="pias-card">
              <span className="pias-skel pias-skel-title" />
              <span className="pias-skel pias-skel-block" />
            </div>
          ))}
        </div>
        <aside className="pias-side">
          <div className="pias-card">
            <span className="pias-skel pias-skel-title" />
            <span className="pias-skel pias-skel-block" />
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function PIAssessmentSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const [form, setForm] = useState(null);
  const [photos, setPhotos] = useState([]); // [{ file, url, name }]
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // Draft saving (see "Draft saving" at the top of this file)
  const [startForm, setStartForm] = useState(null);
  const [restoredAt, setRestoredAt] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [showStartOver, setShowStartOver] = useState(false);
  const draftReady = useRef(false);
  const skipNextSave = useRef(false);

  const [completionPhotos, setCompletionPhotos] = useState([]);
  const [completeError, setCompleteError] = useState('');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  // Every preview link made on this page, so they can all be freed when leaving
  const createdUrls = useRef([]);

  useEffect(() => {
    const urls = createdUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getInstallerTickets();
        if (cancelled) return;
        const found = data.find((t) => String(t.id) === id);
        if (!found) {
          setNotFound(true);
        } else {
          const fresh = buildStartForm(found);
          let nextForm = fresh;
          let nextPhotos = [];
          let savedAt = null;

          if (found.status === 'PI_ASSIGNED' && !found.assessment) {
            // Bring back what was typed last time, if anything
            const draft = await loadDraft(found.id);
            if (cancelled) return;
            if (draft) {
              nextForm = mergeDraftForm(fresh, draft.form);
              nextPhotos = (draft.photos || [])
                .filter((p) => p && p.file instanceof Blob)
                .slice(0, PROOF_MAX)
                .map((p) =>
                  p.file instanceof File
                    ? p.file
                    : new File([p.file], p.name || 'photo.jpg', { type: p.file.type || 'image/jpeg' })
                );
              savedAt = draft.savedAt;
            }
          } else {
            // Already sent or no longer this installer's job: an old draft is not needed
            clearDraft(found.id);
          }

          setTicket(found);
          setStartForm(fresh);
          setForm(nextForm);
          setPhotos(toItems(nextPhotos));
          setRestoredAt(savedAt);
          setDraftSavedAt(savedAt);
          draftReady.current = true;
          skipNextSave.current = true; // what was just loaded is already saved
          setError('');
        }
      } catch {
        if (!cancelled) setError('Could not load this ticket. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Close the photo viewer with the Escape key
  useEffect(() => {
    if (!lightboxSrc) return undefined;
    const onKey = (e) => e.key === 'Escape' && setLightboxSrc(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxSrc]);

  const canEditNow = Boolean(ticket && ticket.status === 'PI_ASSIGNED' && !ticket.assessment && !justSubmitted);

  // Save the draft a moment after each change
  useEffect(() => {
    if (!draftReady.current || !canEditNow || !form || !startForm) return undefined;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return undefined;
    }

    if (!hasChanges(form, startForm, photos)) {
      // Back to a blank sheet: nothing worth keeping
      clearDraft(ticket.id);
      setDraftSavedAt(null);
      setDraftSaving(false);
      return undefined;
    }

    let stopped = false;
    setDraftSaving(true);
    const timer = setTimeout(async () => {
      const savedAt = await saveDraft(ticket.id, form, photos);
      if (stopped) return;
      setDraftSaving(false);
      if (savedAt) setDraftSavedAt(savedAt);
    }, DRAFT_SAVE_DELAY);

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [form, photos, startForm, canEditNow, ticket]);

  // Save right away when the app is put in the background or the tab closes,
  // so the last few keystrokes are not lost
  const latest = useRef({});
  latest.current = { ticket, form, startForm, photos, canEditNow };

  useEffect(() => {
    function saveNow() {
      const { ticket: t, form: f, startForm: s, photos: p, canEditNow: ok } = latest.current;
      if (!draftReady.current || !ok || !f || !s || !hasChanges(f, s, p)) return;
      saveDraft(t.id, f, p);
    }
    const onVisibility = () => document.visibilityState === 'hidden' && saveNow();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', saveNow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveNow);
    };
  }, []);

  // "Start over": clear the saved draft and the sheet
  function handleStartOver() {
    clearDraft(ticket.id);
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setForm(startForm);
    setRestoredAt(null);
    setDraftSavedAt(null);
    setSubmitError('');
    setShowStartOver(false);
  }

  function toItems(files) {
    return files.map((file) => {
      const url = URL.createObjectURL(file);
      createdUrls.current.push(url);
      return { file, url, name: file.name };
    });
  }

  function addPhotos(files) {
    setSubmitError('');
    setPhotos((prev) => {
      const room = PROOF_MAX - prev.length;
      if (files.length > room) {
        setSubmitError(`You can attach up to ${PROOF_MAX} Proof of Visit photos.`);
      }
      return [...prev, ...toItems(files.slice(0, Math.max(0, room)))];
    });
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function addCompletionPhotos(files) {
    setCompleteError('');
    setCompletionPhotos((prev) => [...prev, ...toItems(files)]);
  }

  function removeCompletionPhoto(index) {
    setCompletionPhotos((prev) => {
      URL.revokeObjectURL(prev[index].url);
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleFieldChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSubmitError('');
  }

  // Picking a package also fills in Rated Capacity when it's still empty
  function handlePackageChange(kw) {
    setForm((prev) => ({
      ...prev,
      package_kw: kw,
      rated_capacity_kw: prev.rated_capacity_kw ? prev.rated_capacity_kw : kw,
    }));
    setSubmitError('');
  }

  // Checklist row click: scroll to that part of the form
  function jumpTo(targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const firstInput = el.querySelector('input:not([type="file"]), button, textarea');
    firstInput?.focus({ preventScroll: true });
  }

  function handleSubmitClick(e) {
    e.preventDefault();
    setSubmitError('');

    if (!form.package_kw) {
      setSubmitError('Please pick a Recommended Package.');
      return;
    }
    const numbers = [
      ['estimated_roof_area_sqm', 'Estimated Roof Area'],
      ['rated_capacity_kw', 'Rated Capacity'],
      ['number_of_solar_panels', 'Number of Solar Panels'],
      ['inverter_size_kw', 'Inverter Size'],
    ];
    for (const [key, label] of numbers) {
      if (!isPositive(form[key])) {
        setSubmitError(`Please enter a number greater than 0 for ${label}.`);
        return;
      }
    }
    if (photos.length < PROOF_MIN || photos.length > PROOF_MAX) {
      setSubmitError(`Please attach ${PROOF_MIN} or ${PROOF_MAX} Proof of Visit photos.`);
      return;
    }

    setShowConfirm(true);
  }

  async function performSubmit() {
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('estimated_roof_area_sqm', form.estimated_roof_area_sqm);
      formData.append('roof_type', form.roof_type);
      formData.append('roof_condition', form.roof_condition);
      formData.append(
        'recommended_package',
        `${form.package_kw}KW ${SYSTEM_TYPE_LABELS[form.recommended_system_type]}`
      );
      formData.append('recommended_system_type', form.recommended_system_type);
      formData.append('rated_capacity_kw', form.rated_capacity_kw);
      formData.append('number_of_solar_panels', form.number_of_solar_panels);
      formData.append('inverter_size_kw', form.inverter_size_kw);
      formData.append('notes', form.notes);
      photos.forEach((p) => formData.append('photos', p.file));

      const updatedTicket = await submitAssessment(ticket.id, formData);
      clearDraft(ticket.id);
      setTicket(updatedTicket);
      setJustSubmitted(true);
      setRestoredAt(null);
      setDraftSavedAt(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'Could not submit the assessment. Please check the form and try again.'));
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  function handleCompleteClick(e) {
    e.preventDefault();
    setCompleteError('');
    if (completionPhotos.length < 1) {
      setCompleteError('Please attach at least one completion photo.');
      return;
    }
    setShowCompleteConfirm(true);
  }

  async function performComplete() {
    setCompleting(true);
    try {
      const formData = new FormData();
      completionPhotos.forEach((p) => formData.append('photos', p.file));

      const updatedTicket = await completeInstallation(ticket.id, formData);
      setTicket(updatedTicket);
      setJustCompleted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setCompleteError(getErrorMessage(err, 'Could not mark this installation complete. Please try again.'));
    } finally {
      setCompleting(false);
      setShowCompleteConfirm(false);
    }
  }

  const goBack = () => navigate('/partner-installer/incoming-tickets');

  const canEdit = ticket && ticket.status === 'PI_ASSIGNED' && !ticket.assessment;
  const canComplete = ticket && ticket.status === 'APPROVED';
  const isCompleted = ticket && ticket.status === 'COMPLETED';

  const badge = ticket ? STATUS_BADGE[ticket.status] || STATUS_BADGE.ASSESSMENT_SUBMITTED : null;
  const hint = ticket ? visitHint(ticket) : null;
  const isLate = canEdit && hint?.tone === 'late';
  const isToday = canEdit && hint?.text === 'Visit today';
  const customerName = ticket ? ticket.full_name || ticket.customer_username : '';

  const checks = form
    ? [
        {
          key: 'roof',
          label: 'Roof details',
          sub: 'Roof area, condition and type',
          done: isPositive(form.estimated_roof_area_sqm),
          target: 'pias-step-roof',
        },
        {
          key: 'package',
          label: 'Package and system type',
          sub: form.package_kw
            ? `${form.package_kw}KW ${SYSTEM_TYPE_LABELS[form.recommended_system_type]}`
            : 'Pick a package size',
          done: Boolean(form.package_kw),
          target: 'pias-step-system',
        },
        {
          key: 'numbers',
          label: 'System numbers',
          sub: 'Capacity, panels and inverter size',
          done:
            isPositive(form.rated_capacity_kw) &&
            isPositive(form.number_of_solar_panels) &&
            isPositive(form.inverter_size_kw),
          target: 'pias-step-numbers',
        },
        {
          key: 'photos',
          label: 'Proof of Visit',
          sub: `${PROOF_MIN} or ${PROOF_MAX} photos of the roof or site`,
          done: photos.length >= PROOF_MIN,
          target: 'pias-step-proof',
        },
      ]
    : [];

  const assessment = ticket?.assessment;

  return (
    <PILayout>
      <div className="pias-page">
        {loading && <PageSkeleton />}

        {!loading && (error || notFound) && (
          <div className="pias-card">
            <div className="pias-empty-state">
              <span className={`pias-empty-badge ${error ? 'red' : ''}`}>
                {error ? <AlertCircle size={26} /> : <SearchX size={26} />}
              </span>
              <p className="pias-empty-title">{error ? 'Something went wrong' : 'Ticket not found'}</p>
              <p className="pias-empty-hint">{error || 'This ticket may not be assigned to you, or the link is wrong.'}</p>
              <button type="button" className="pias-btn-secondary" onClick={goBack}>
                <ArrowLeft size={15} />
                Back to Incoming Tickets
              </button>
            </div>
          </div>
        )}

        {!loading && !error && ticket && (
          <div className="pias-stack">
            {/* Header */}
            <div className="pias-hero">
              <span className="pias-hero-glow" />
              <button type="button" className="pias-back" onClick={goBack} aria-label="Back to Incoming Tickets">
                <ArrowLeft size={18} />
              </button>
              <span className="pias-hero-icon">
                <ClipboardList size={22} />
              </span>
              <div className="pias-hero-text">
                <span className="pias-hero-kicker">{ticket.ticket_number}</span>
                <h1>Assessment Sheet</h1>
                <p>
                  <CalendarDays size={14} />
                  Visit: {formatDate(ticket.visit_date)}
                  {hint && <span className={`pias-hero-when ${hint.tone}`}>{hint.text}</span>}
                </p>
              </div>
              <span className={`pias-status tone-${badge.tone}`}>
                <span className="pias-status-dot" />
                {ticket.status_display}
              </span>
            </div>

            {/* Overdue / visit today (same boxes as the Dashboard) */}
            {isLate && (
              <div className="pias-alert red">
                <span className="pias-alert-icon">
                  <AlertTriangle size={20} />
                </span>
                <div className="pias-alert-text">
                  <p className="pias-alert-title">This assessment is overdue</p>
                  <p className="pias-alert-sub">
                    The visit date was {formatDate(ticket.visit_date)}. Please fill in the sheet and send it to Staff.
                  </p>
                </div>
              </div>
            )}
            {isToday && (
              <div className="pias-alert gold">
                <span className="pias-alert-icon">
                  <CalendarDays size={20} />
                </span>
                <div className="pias-alert-text">
                  <p className="pias-alert-title">Site visit today</p>
                  <p className="pias-alert-sub">Fill in the sheet while you are at the property.</p>
                </div>
              </div>
            )}

            {canEdit && form && restoredAt && (
              <div className="pias-draft-banner">
                <span className="pias-draft-icon">
                  <History size={20} />
                </span>
                <div className="pias-draft-text">
                  <p className="pias-draft-title">We brought back your last inputs</p>
                  <p className="pias-draft-sub">
                    This sheet was saved {formatSavedTime(restoredAt)}. Check it, then continue where you left off.
                  </p>
                </div>
                <div className="pias-draft-actions">
                  <button type="button" className="pias-draft-btn" onClick={() => setShowStartOver(true)}>
                    <RotateCcw size={14} />
                    Start over
                  </button>
                  <button
                    type="button"
                    className="pias-draft-close"
                    onClick={() => setRestoredAt(null)}
                    aria-label="Hide this message"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {canEdit && form && (
              <StepTracker checks={checks} onJump={jumpTo} savedAt={draftSavedAt} saving={draftSaving} />
            )}

            {justSubmitted && (
              <div className="pias-banner green">
                <span className="pias-banner-icon">
                  <CheckCircle size={20} />
                </span>
                <div>
                  <p className="pias-banner-title">Assessment submitted!</p>
                  <p className="pias-banner-sub">
                    It's been sent to Staff for review. You can't edit it anymore, but you can still see what you sent below.
                  </p>
                </div>
              </div>
            )}

            {justCompleted && (
              <div className="pias-banner green">
                <span className="pias-banner-icon">
                  <CheckCircle size={20} />
                </span>
                <div>
                  <p className="pias-banner-title">Installation marked complete!</p>
                  <p className="pias-banner-sub">The customer has been notified. Thanks for finishing this one.</p>
                </div>
              </div>
            )}

            <div className="pias-layout">
              <div className="pias-main">
                {/* Assessment form */}
                {canEdit && form && (
                  <form id="pias-assess-form" className="pias-form" onSubmit={handleSubmitClick} noValidate>
                    {/* Step 1 */}
                    <section className="pias-card" id="pias-step-roof">
                      <SectionTitle
                        step={1}
                        title="Roof Details"
                        subtitle="Check the roof during the site visit."
                        done={checks[0]?.done}
                      />
                      <div className="pias-form-grid">
                        <div className="pias-form-field">
                          <label htmlFor="pias-area">Estimated Roof Area</label>
                          <UnitInput
                            id="pias-area"
                            icon={Ruler}
                            unit="sq.m"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 60"
                            value={form.estimated_roof_area_sqm}
                            onChange={(e) => handleFieldChange('estimated_roof_area_sqm', e.target.value)}
                          />
                        </div>
                        <div className="pias-form-field">
                          <span className="pias-label">Roof Condition</span>
                          <ChipGroup
                            name="Roof Condition"
                            options={ROOF_CONDITION_OPTIONS}
                            value={form.roof_condition}
                            onChange={(v) => handleFieldChange('roof_condition', v)}
                          />
                        </div>
                        <div className="pias-form-field wide">
                          <span className="pias-label">Roof Type</span>
                          <ChipGroup
                            name="Roof Type"
                            options={ROOF_TYPE_OPTIONS}
                            value={form.roof_type}
                            onChange={(v) => handleFieldChange('roof_type', v)}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Step 2 */}
                    <section className="pias-card" id="pias-step-system">
                      <SectionTitle
                        step={2}
                        title="System Recommendation"
                        subtitle="Starts on the customer's choice. Change it if the roof needs something else."
                        done={checks[1]?.done && checks[2]?.done}
                      />
                      <div className="pias-form-field">
                        <span className="pias-label">Recommended Package</span>
                        <PackagePicker
                          value={form.package_kw}
                          onChange={handlePackageChange}
                          customerKw={customerPackageKw(ticket)}
                        />
                      </div>
                      <div className="pias-form-field pias-gap-top">
                        <span className="pias-label">System Type</span>
                        <ChipGroup
                          name="System Type"
                          options={SYSTEM_TYPE_OPTIONS}
                          value={form.recommended_system_type}
                          onChange={(v) => handleFieldChange('recommended_system_type', v)}
                        />
                      </div>

                      <div className="pias-numbers" id="pias-step-numbers">
                        <div className="pias-form-field">
                          <label htmlFor="pias-capacity">Rated Capacity</label>
                          <UnitInput
                            id="pias-capacity"
                            icon={Zap}
                            unit="kW"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 6"
                            value={form.rated_capacity_kw}
                            onChange={(e) => handleFieldChange('rated_capacity_kw', e.target.value)}
                          />
                        </div>
                        <div className="pias-form-field">
                          <label htmlFor="pias-panels">Solar Panels</label>
                          <UnitInput
                            id="pias-panels"
                            icon={LayoutGrid}
                            unit="pcs"
                            type="number"
                            min="0"
                            placeholder="e.g. 12"
                            value={form.number_of_solar_panels}
                            onChange={(e) => handleFieldChange('number_of_solar_panels', e.target.value)}
                          />
                        </div>
                        <div className="pias-form-field">
                          <label htmlFor="pias-inverter">Inverter Size</label>
                          <UnitInput
                            id="pias-inverter"
                            icon={Cpu}
                            unit="kW"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 5"
                            value={form.inverter_size_kw}
                            onChange={(e) => handleFieldChange('inverter_size_kw', e.target.value)}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Step 3 */}
                    <section className="pias-card" id="pias-step-proof">
                      <SectionTitle
                        step={3}
                        title="Notes and Proof of Visit"
                        subtitle="Photos show Staff that the visit happened."
                        done={checks[3]?.done}
                      />
                      <div className="pias-form-field">
                        <span className="pias-label">Proof of Visit Photos</span>
                        <PhotoPicker
                          items={photos}
                          min={PROOF_MIN}
                          max={PROOF_MAX}
                          onAdd={addPhotos}
                          onRemove={removePhoto}
                          onPreview={setLightboxSrc}
                          hint={`Attach ${PROOF_MIN} or ${PROOF_MAX} photos of the roof or site. JPG or PNG.`}
                        />
                      </div>
                      <div className="pias-form-field pias-gap-top">
                        <label htmlFor="pias-notes">
                          Notes <span className="pias-optional">(optional)</span>
                        </label>
                        <textarea
                          id="pias-notes"
                          className="pias-textarea"
                          maxLength={NOTES_MAX}
                          rows={3}
                          placeholder="Anything Staff should know, like shading, roof access, or wiring concerns..."
                          value={form.notes}
                          onChange={(e) => handleFieldChange('notes', e.target.value)}
                        />
                        <span className="pias-counter">
                          {form.notes.length} / {NOTES_MAX}
                        </span>
                      </div>
                    </section>
                  </form>
                )}

                {/* Mark installation complete */}
                {canComplete && (
                  <form className="pias-card pias-complete-card" onSubmit={handleCompleteClick} noValidate>
                    <SectionTitle
                      icon={Hammer}
                      tone="gold"
                      title="Mark Installation Complete"
                      subtitle="Once the work is done on-site, add at least one photo of the finished installation. The customer will be notified."
                    />

                    <PhotoPicker
                      items={completionPhotos}
                      min={1}
                      onAdd={addCompletionPhotos}
                      onRemove={removeCompletionPhoto}
                      onPreview={setLightboxSrc}
                      hint="Photos of the finished installation. JPG or PNG."
                    />

                    {completeError && (
                      <p className="pias-notice red">
                        <AlertCircle size={15} />
                        <span>{completeError}</span>
                      </p>
                    )}

                    <div className="pias-complete-foot">
                      <button type="submit" className="pias-btn-primary" disabled={completing}>
                        <FileCheck size={15} />
                        {completing ? 'Marking Complete...' : 'Mark Installation Complete'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Completed */}
                {isCompleted && (
                  <div className="pias-card">
                    <SectionTitle
                      icon={Award}
                      tone="gold"
                      title="Installation Completed"
                      subtitle={`Completed on ${
                        ticket.completed_at
                          ? new Date(ticket.completed_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'
                      }`}
                    />
                    {ticket.completion_photos?.length > 0 ? (
                      <PhotoGallery photos={ticket.completion_photos} alt="Proof of completion" onPreview={setLightboxSrc} />
                    ) : (
                      <p className="pias-muted">No completion photos were attached.</p>
                    )}
                  </div>
                )}

                {/* Submitted assessment (read-only) */}
                {!canEdit && (
                  <div className="pias-card">
                    <SectionTitle
                      icon={ClipboardCheck}
                      tone="green"
                      title="Roof Assessment"
                      subtitle={assessment ? 'What you sent to Staff.' : undefined}
                    />
                    {assessment ? (
                      <>
                        <div className="pias-stats">
                          <StatBox icon={Ruler} label="Roof Area" value={assessment.estimated_roof_area_sqm} unit="sq.m" />
                          <StatBox icon={Zap} label="Capacity" value={assessment.rated_capacity_kw} unit="kW" />
                          <StatBox icon={LayoutGrid} label="Solar Panels" value={assessment.number_of_solar_panels} unit="pcs" />
                          <StatBox icon={Cpu} label="Inverter" value={assessment.inverter_size_kw} unit="kW" />
                        </div>
                        <div className="pias-grid">
                          <Field label="Recommended Package" value={assessment.recommended_package} />
                          <Field label="Recommended System" value={assessment.recommended_system_type_display} />
                          <Field label="Roof Type" value={assessment.roof_type_display} />
                          <Field
                            label="Roof Condition"
                            value={assessment.roof_condition_display}
                            tone={CONDITION_TONE[assessment.roof_condition]}
                          />
                        </div>
                        {assessment.notes && (
                          <div className="pias-notes-box">
                            <p className="pias-notes-title">
                              <MessageSquareText size={14} />
                              Your Notes
                            </p>
                            <p>{assessment.notes}</p>
                          </div>
                        )}
                        {assessment.photos?.length > 0 && (
                          <>
                            <p className="pias-group-label">Proof of Visit</p>
                            <PhotoGallery photos={assessment.photos} alt="Proof of visit" onPreview={setLightboxSrc} />
                          </>
                        )}
                      </>
                    ) : (
                      <div className="pias-empty-state compact">
                        <span className="pias-empty-badge">
                          <Home size={24} />
                        </span>
                        <p className="pias-empty-title">No assessment submitted</p>
                        <p className="pias-empty-hint">The roof assessment details will show up here once sent.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <aside className="pias-side">
                <CustomerCard ticket={ticket} customerName={customerName} />
                {canEdit && form && (
                  <ChecklistCard checks={checks} error={submitError} submitting={submitting} onJump={jumpTo} />
                )}
              </aside>
            </div>
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          icon={Send}
          tone="navy"
          title="Submit this assessment?"
          message="You won't be able to edit it after submitting. It goes straight to Staff for review."
          confirmLabel="Submit"
          busyLabel="Submitting..."
          busy={submitting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={performSubmit}
        />
      )}

      {showStartOver && (
        <ConfirmModal
          icon={RotateCcw}
          tone="red"
          title="Start over?"
          message="Everything you entered on this sheet, including the photos, will be cleared. This can't be undone."
          confirmLabel="Clear and Start Over"
          busyLabel="Clearing..."
          busy={false}
          onCancel={() => setShowStartOver(false)}
          onConfirm={handleStartOver}
        />
      )}

      {showCompleteConfirm && (
        <ConfirmModal
          icon={Award}
          tone="gold"
          title="Mark this installation complete?"
          message="The customer will be notified. You can't undo this from here."
          confirmLabel="Mark Complete"
          busyLabel="Marking Complete..."
          busy={completing}
          onCancel={() => setShowCompleteConfirm(false)}
          onConfirm={performComplete}
        />
      )}

      {lightboxSrc && (
        <div className="pias-lightbox" onClick={() => setLightboxSrc(null)}>
          <button type="button" className="pias-lightbox-close" onClick={() => setLightboxSrc(null)} aria-label="Close">
            <X size={20} />
          </button>
          <img src={lightboxSrc} alt="Full size" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </PILayout>
  );
}