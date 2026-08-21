import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets, getPartnerInstallers, assignPartnerInstaller } from "../../../api/staffTickets";
import "../styles/staff-ticket-detail.css";

const STATUS_TAG_CLASS = {
  APPROVED: "approved",
  COMPLETED: "approved",
  WITHDRAWN: "withdrawn",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  REQUEST_SUBMITTED: "pending",
  PI_ASSIGNED: "in-progress",
  ASSESSMENT_SUBMITTED: "in-progress",
  STAFF_REVIEW: "in-progress",
  ADMIN_REVIEW: "in-progress",
};

function ConfirmModal({ installerName, visitDate, onCancel, onConfirm, busy }) {
  return (
    <div className="stftd-modal-overlay" onClick={onCancel}>
      <div className="stftd-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Assign Partner Installer?</h3>
        <p>
          Assign this ticket to <strong>{installerName}</strong> for a visit on{" "}
          <strong>{visitDate}</strong>. They will be notified by email.
        </p>
        <div className="stftd-modal-actions">
          <button className="stftd-btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="stftd-btn-confirm" onClick={onConfirm} disabled={busy}>
            {busy ? "Assigning..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return <div className={`stftd-toast ${type}`}>{message}</div>;
}

export default function StaffTicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [ticket, setTicket] = useState(null);
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [installerId, setInstallerId] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    try {
      const [ticketData, installerData] = await Promise.all([
        getStaffTickets(),
        getPartnerInstallers(),
      ]);
      const found = ticketData.find((t) => String(t.id) === String(id));
      setTicket(found || null);
      setInstallers(installerData);
    } catch {
      setError("Could not load this ticket.");
    } finally {
      setLoading(false);
    }
  }

  const canAssign = ticket && ticket.status === "REQUEST_SUBMITTED";
  const tagClass = ticket ? STATUS_TAG_CLASS[ticket.status] || "in-progress" : "in-progress";

  function handleAssignClick() {
    if (!installerId || !visitDate) {
      setToast({ message: "Please select a Partner Installer and a Visit Date.", type: "error" });
      return;
    }
    setShowConfirm(true);
  }

  async function performAssign() {
    setAssigning(true);
    try {
      await assignPartnerInstaller(id, {
        partner_installer_id: installerId,
        visit_date: visitDate,
      });
      await load();
      setToast({ message: "Partner Installer assigned successfully.", type: "success" });
      setInstallerId("");
      setVisitDate("");
    } catch (err) {
      const msg = err?.response?.data?.non_field_errors?.[0] ||
        "Could not assign Partner Installer. Please try again.";
      setToast({ message: msg, type: "error" });
    } finally {
      setAssigning(false);
      setShowConfirm(false);
    }
  }

  return (
    <StaffLayout>
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <div className="stftd-page">
        {loading && <p className="stftd-loading">Loading...</p>}
        {error && <p className="stftd-error">{error}</p>}
        {!loading && !error && !ticket && <p className="stftd-error">Ticket not found.</p>}

        {!loading && !error && ticket && (
          <div className="stftd-doc">
            <div className="stftd-header">
              <div className="stftd-header-left">
                <button className="stftd-back" onClick={() => navigate("/staff/manage-tickets")}>
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h1>{ticket.full_name || ticket.customer_username}</h1>
                  <p>
                    {ticket.ticket_number}
                    {ticket.status_display ? ` \u00B7 ${ticket.status_display}` : ""}
                  </p>
                </div>
              </div>
              <span className={`stftd-status-tag ${tagClass}`}>{ticket.status_display}</span>
            </div>

            <div className="stftd-body">
              <section className="stftd-section">
                <h2>Customer Information</h2>
                <div className="stftd-grid stftd-grid-3">
                  <div className="stftd-field">
                    <label>Customer</label>
                    <p>{ticket.full_name || ticket.customer_username}</p>
                  </div>
                  <div className="stftd-field">
                    <label>Contact</label>
                    <p>{ticket.contact_number}</p>
                  </div>
                  <div className="stftd-field">
                    <label>Partner Installer</label>
                    <p>{ticket.partner_installer_username || "Not yet assigned"}</p>
                  </div>
                  <div className="stftd-field">
                    <label>Address</label>
                    <p>{ticket.property_address}</p>
                  </div>
                  <div className="stftd-field">
                    <label>Date Submitted</label>
                    <p>{new Date(ticket.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
                  </div>
                  <div className="stftd-field">
                    <label>Preferred Package</label>
                    <p>{ticket.solar_package}</p>
                  </div>
                  <div className="stftd-field">
                    <label>System Type</label>
                    <p>{ticket.system_type === "ON_GRID" ? "On-Grid" : "Hybrid"}</p>
                  </div>
                </div>
              </section>

              <section className="stftd-section">
                <h2>Request Status</h2>
                <p className="stftd-note-plain">
                  Roof type and other assessment details will be filled out by the Partner
                  Installer during the site visit.
                </p>
              </section>

              {(canAssign || ticket.partner_installer_username) && (
                <section className="stftd-section">
                  <h2>Assign Partner Installer</h2>

                  {!canAssign ? (
                    <p className="stftd-empty">
                      Assigned to <strong>{ticket.partner_installer_username}</strong> for a
                      visit on <strong>{ticket.visit_date}</strong>.
                    </p>
                  ) : (
                    <>
                      <label className="stftd-select-label">Select Partner Installer</label>
                      <div className="stftd-installer-grid">
                        {installers.length === 0 ? (
                          <p className="stftd-empty">No active Partner Installers available.</p>
                        ) : (
                          installers.map((i) => {
                            const isSelected = String(installerId) === String(i.id);
                            const iInitials = i.username.slice(0, 2).toUpperCase();
                            return (
                              <button
                                key={i.id}
                                type="button"
                                className={`stftd-installer-card ${isSelected ? "selected" : ""}`}
                                onClick={() => setInstallerId(i.id)}
                              >
                                <span className="stftd-installer-avatar">{iInitials}</span>
                                <span className="stftd-installer-name">{i.username}</span>
                                {isSelected && <span className="stftd-installer-check">✓</span>}
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="stftd-field stftd-field-date">
                        <label>Visit Date</label>
                        <input
                          type="date"
                          value={visitDate}
                          onChange={(e) => setVisitDate(e.target.value)}
                        />
                      </div>

                      <button
                        className="stftd-assign-button"
                        onClick={handleAssignClick}
                        disabled={assigning}
                      >
                        Confirm Assignment & Notify Partner Installer
                      </button>
                      <p className="stftd-assign-footnote">
                        The Partner Installer will receive a notification by email.
                      </p>
                    </>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </div>

      {showConfirm && (
        <ConfirmModal
          installerName={installers.find((i) => String(i.id) === String(installerId))?.username}
          visitDate={visitDate}
          busy={assigning}
          onCancel={() => setShowConfirm(false)}
          onConfirm={performAssign}
        />
      )}
    </StaffLayout>
  );
}