import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  User,
  Home,
  Wallet,
  Ruler,
  Zap,
  LayoutGrid,
  Cpu,
  MessageSquareText,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Award,
  XCircle,
  Ban,
  SearchX,
  AlertCircle,
  Phone,
  HardHat,
  Package,
  Sun,
  MapPin,
  ClipboardList,
  History,
  FileText,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import DirectionsLink from "../components/DirectionsLink";
import { getStaffTickets } from "../../../api/staffTickets";
import { formatCurrency, formatPaymentTerms } from "../../../utils/currency";
import "../styles/staff-completed-ticket-detail.css";

// Look and message for each final status
const STATUS_INFO = {
  APPROVED: {
    tone: "green",
    icon: CheckCircle2,
    title: "Approved by Admin",
    message: "This ticket was approved. The final price and payment terms are shown below.",
  },
  COMPLETED: {
    tone: "gold",
    icon: Award,
    title: "Project completed",
    message: "The solar installation for this customer is done.",
  },
  NC_CANNOT_PROCEED: {
    tone: "red",
    icon: XCircle,
    title: "Not compatible",
    message: "The roof is not compatible with a solar system. This customer cannot proceed.",
  },
  NC_CAN_REAPPLY: {
    tone: "red",
    icon: XCircle,
    title: "Not compatible for now",
    message: "The roof is not compatible right now. The customer can apply again later.",
  },
  WITHDRAWN: {
    tone: "gray",
    icon: Ban,
    title: "Request withdrawn",
    message: "The customer withdrew this request.",
  },
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function CardTitle({ icon: Icon, tone, title, hint }) {
  return (
    <div className="stfcd-card-head">
      <span className={`stfcd-card-icon icon-${tone}`}>
        <Icon size={18} />
      </span>
      <div className="stfcd-card-head-text">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value, muted, wide, children }) {
  return (
    <div className={`stfcd-info ${wide ? "stfcd-info-wide" : ""}`}>
      <span className="stfcd-info-icon">
        <Icon size={16} />
      </span>
      <div className="stfcd-info-text">
        <span className="stfcd-info-label">{label}</span>
        {children || <span className={`stfcd-info-value ${muted ? "is-muted" : ""}`}>{value || "—"}</span>}
      </div>
    </div>
  );
}

function StatBox({ icon: Icon, label, value }) {
  return (
    <div className="stfcd-stat">
      <span className="stfcd-stat-icon">
        <Icon size={18} />
      </span>
      <div className="stfcd-stat-text">
        <span className="stfcd-stat-label">{label}</span>
        <span className="stfcd-stat-value">{value}</span>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="stfcd-detail-row">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="stfcd-wrap" aria-busy="true">
      <div className="stfcd-skel stfcd-skel-hero" />
      <div className="stfcd-grid">
        <div className="stfcd-main">
          <div className="stfcd-skel stfcd-skel-card" />
        </div>
        <div className="stfcd-side">
          <div className="stfcd-skel stfcd-skel-card-sm" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, red, title, hint, onBack }) {
  return (
    <div className="stfcd-card">
      <div className="stfcd-empty-state">
        <span className={`stfcd-empty-badge ${red ? "stfcd-empty-badge-red" : ""}`}>
          <Icon size={26} />
        </span>
        <p className="stfcd-empty-title">{title}</p>
        <p className="stfcd-empty-hint">{hint}</p>
        <button type="button" className="stfcd-btn-secondary" onClick={onBack}>
          <ArrowLeft size={15} />
          Back to Completed Tickets
        </button>
      </div>
    </div>
  );
}

export default function StaffCompletedTicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await getStaffTickets();
        const found = data.find((t) => String(t.id) === String(id));
        setTicket(found || null);
      } catch {
        setError("Could not load this ticket.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const goBack = () => navigate("/staff/completed-tickets");

  const assessment = ticket?.assessment;
  const finalSheet = ticket?.final_sheet;
  const info = (ticket && STATUS_INFO[ticket.status]) || STATUS_INFO.APPROVED;
  const StatusIcon = info.icon;
  const finishedDate = ticket?.completed_at || ticket?.updated_at;
  const displayName = ticket?.full_name || ticket?.customer_username || "Customer";
  const installer = ticket?.partner_installer_username;

  // Extra line for the outcome banner when some steps never happened
  let outcomeNote = "";
  if (ticket?.status === "WITHDRAWN" && !assessment) {
    outcomeNote = "It was withdrawn before a roof assessment was done.";
  } else if (!finalSheet && (ticket?.status === "APPROVED" || ticket?.status === "COMPLETED")) {
    outcomeNote = "No final price was recorded for this ticket.";
  }

  // Steps for the timeline on the right side
  const timeline = ticket
    ? [
        { label: "Request submitted", date: ticket.created_at, done: true },
        { label: "Partner Installer assigned", date: null, done: Boolean(installer), sub: installer || null },
        { label: "Roof assessment submitted", date: assessment?.submitted_at, done: Boolean(assessment) },
        { label: "Final price set", date: finalSheet?.approved_at, done: Boolean(finalSheet) },
        { label: ticket.status_display, date: finishedDate, done: true, final: true },
      ]
    : [];

  return (
    <StaffLayout>
      <div className="stfcd-page">
        {loading && <DetailSkeleton />}

        {!loading && error && (
          <EmptyState icon={AlertCircle} red title="Something went wrong" hint={error} onBack={goBack} />
        )}

        {!loading && !error && !ticket && (
          <EmptyState
            icon={SearchX}
            title="Ticket not found"
            hint="This ticket may have been removed, or the link is wrong."
            onBack={goBack}
          />
        )}

        {!loading && !error && ticket && (
          <div className="stfcd-wrap">
            {/* Top banner */}
            <section className="stfcd-hero">
              <div className="stfcd-hero-glow" aria-hidden="true" />
              <button type="button" className="stfcd-back" onClick={goBack} aria-label="Back to Completed Tickets">
                <ArrowLeft size={18} />
              </button>
              <span className="stfcd-hero-avatar">{getInitials(displayName)}</span>
              <div className="stfcd-hero-text">
                <span className="stfcd-hero-kicker">
                  Assessment Sheet &middot; <span>{ticket.ticket_number}</span>
                </span>
                <h1 title={displayName}>{displayName}</h1>
                <p>
                  <CalendarDays size={14} />
                  {ticket.status_display}
                  {finishedDate && ` on ${formatDate(finishedDate)}`}
                </p>
              </div>
              <span className={`stfcd-hero-status tone-${info.tone}`}>
                <StatusIcon size={14} />
                {ticket.status_display}
              </span>
            </section>

            {/* What happened to this ticket */}
            <div className={`stfcd-outcome tone-${info.tone}`}>
              <span className="stfcd-outcome-icon">
                <StatusIcon size={20} />
              </span>
              <div>
                <strong>{info.title}</strong>
                <p>
                  {info.message}
                  {outcomeNote && ` ${outcomeNote}`}
                </p>
              </div>
            </div>

            <div className="stfcd-grid">
              <div className="stfcd-main">
                {/* Customer information */}
                <section className="stfcd-card">
                  <CardTitle icon={User} tone="navy" title="Customer Information" hint="Details from the customer's request" />
                  <div className="stfcd-info-grid">
                    <InfoItem icon={User} label="Customer" value={displayName} />
                    <InfoItem icon={Phone} label="Contact">
                      {ticket.contact_number ? (
                        <a className="stfcd-info-value stfcd-phone" href={`tel:${ticket.contact_number}`}>
                          {ticket.contact_number}
                        </a>
                      ) : (
                        <span className="stfcd-info-value is-muted">—</span>
                      )}
                    </InfoItem>
                    <InfoItem icon={HardHat} label="Partner Installer" value={installer || "Not assigned"} muted={!installer} />
                    <InfoItem icon={CalendarDays} label="Date Submitted" value={formatDate(ticket.created_at)} />
                    <InfoItem icon={Package} label="Preferred Package" value={ticket.solar_package} />
                    <InfoItem
                      icon={Sun}
                      label="System Type"
                      value={ticket.system_type === "ON_GRID" ? "On-Grid" : "Hybrid"}
                    />
                  </div>

                  <div className="stfcd-address">
                    <span className="stfcd-address-icon">
                      <MapPin size={18} />
                    </span>
                    <div className="stfcd-address-text">
                      <span className="stfcd-info-label">Address</span>
                      <span className="stfcd-address-value">{ticket.property_address || "—"}</span>
                    </div>
                    {ticket.property_address && (
                      <div className="stfcd-directions">
                        <DirectionsLink address={ticket.property_address} />
                      </div>
                    )}
                  </div>
                </section>

                {/* Roof assessment */}
                <section className="stfcd-card">
                  <CardTitle
                    icon={Home}
                    tone="blue"
                    title="Roof Assessment"
                    hint={
                      assessment
                        ? `Sent by the Partner Installer${assessment.submitted_at ? ` on ${formatDate(assessment.submitted_at)}` : ""}`
                        : null
                    }
                  />

                  {assessment ? (
                    <>
                      <div className="stfcd-stats">
                        <StatBox icon={Ruler} label="Roof Area" value={`${assessment.estimated_roof_area_sqm} sq.m.`} />
                        <StatBox icon={Zap} label="Capacity" value={`${assessment.rated_capacity_kw} kW`} />
                        <StatBox icon={LayoutGrid} label="Solar Panels" value={`${assessment.number_of_solar_panels} pcs`} />
                        <StatBox icon={Cpu} label="Inverter" value={`${assessment.inverter_size_kw} kW`} />
                      </div>

                      <div className="stfcd-details">
                        <DetailRow label="Roof Type" value={assessment.roof_type_display} />
                        <DetailRow label="Roof Condition" value={assessment.roof_condition_display} />
                        <DetailRow label="Recommended Package" value={assessment.recommended_package} />
                        <DetailRow label="Recommended System" value={assessment.recommended_system_type_display} />
                      </div>

                      {assessment.notes && (
                        <div className="stfcd-notes-box">
                          <div className="stfcd-notes-title">
                            <MessageSquareText size={14} />
                            Partner Installer Notes
                          </div>
                          <p>{assessment.notes}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="stfcd-none">
                      <ClipboardList size={22} />
                      <div>
                        <strong>No roof assessment</strong>
                        <p>The Partner Installer did not send an assessment for this ticket.</p>
                      </div>
                    </div>
                  )}
                </section>
              </div>

              <aside className="stfcd-side">
                {/* Final cost and payment terms */}
                <section className="stfcd-card">
                  <CardTitle icon={Wallet} tone="green" title="Final Cost" hint="Price and payment terms" />

                  {finalSheet ? (
                    <>
                      <div className="stfcd-final-price-box">
                        <div className="stfcd-final-price-top">
                          <label>Final Price</label>
                          <span className="stfcd-final-tag">Final</span>
                        </div>
                        <p>{formatCurrency(finalSheet.final_cost)}</p>
                      </div>
                      <div className="stfcd-payment-box">
                        <span className="stfcd-payment-icon">
                          <CalendarCheck size={18} />
                        </span>
                        <div>
                          <label>Payment Terms</label>
                          <p>
                            {finalSheet.payment_terms_summary
                              ? formatPaymentTerms(finalSheet.payment_terms_summary)
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="stfcd-none">
                      <FileText size={22} />
                      <div>
                        <strong>No final price</strong>
                        <p>This ticket closed without a final price.</p>
                      </div>
                    </div>
                  )}
                </section>

                {/* Timeline */}
                <section className="stfcd-card">
                  <CardTitle icon={History} tone="navy" title="Ticket History" hint="What happened, step by step" />
                  <ol className="stfcd-timeline">
                    {timeline.map((step) => (
                      <li
                        key={step.label}
                        className={`stfcd-step ${step.done ? "is-done" : "is-skipped"} ${
                          step.final ? `is-final tone-${info.tone}` : ""
                        }`}
                      >
                        <span className="stfcd-step-dot" aria-hidden="true">
                          {step.final ? <StatusIcon size={12} /> : step.done ? <CheckCircle2 size={12} /> : null}
                        </span>
                        <div className="stfcd-step-text">
                          <strong>{step.label}</strong>
                          <span>
                            {step.done
                              ? step.sub || (step.date ? formatDate(step.date) : "Done")
                              : "Skipped"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </aside>
            </div>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}