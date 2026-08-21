import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffTickets } from "../../../api/staffTickets";
import { formatCurrency } from "../../../utils/currency";
import "../styles/staff-completed-ticket-detail.css";

const STATUS_TAG_CLASS = {
  APPROVED: "approved",
  COMPLETED: "approved",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
};

function Field({ label, value }) {
  return (
    <div className="stfcd-field">
      <label>{label}</label>
      <p>{value}</p>
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

  const assessment = ticket?.assessment;
  const finalSheet = ticket?.final_sheet;
  const tagClass = ticket ? STATUS_TAG_CLASS[ticket.status] || "approved" : "approved";
  const finishedDate = ticket?.completed_at || ticket?.updated_at;

  return (
    <StaffLayout>
      <div className="stfcd-wrapper">
        <div className="stfcd-page">
          {loading && <p className="stfcd-loading">Loading...</p>}
          {error && <p className="stfcd-error">{error}</p>}
          {!loading && !error && !ticket && <p className="stfcd-error">Ticket not found.</p>}

          {!loading && !error && ticket && (
            <div className="stfcd-doc">
              <div className="stfcd-header">
                <div className="stfcd-header-left">
                  <button className="stfcd-back" onClick={() => navigate("/staff/completed-tickets")}>
                    <ArrowLeft size={18} />
                  </button>
                  <div>
                    <h1>Assessment Sheet</h1>
                    <p>
                      {ticket.ticket_number} &middot; {ticket.status_display}
                      {finishedDate && ` on ${new Date(finishedDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`}
                    </p>
                  </div>
                </div>
                <span className={`stfcd-status-tag ${tagClass}`}>{ticket.status_display}</span>
              </div>

              <div className="stfcd-body">
                <section className="stfcd-section">
                  <h2>Customer Information</h2>
                  <div className="stfcd-grid stfcd-grid-3">
                    <Field label="Customer" value={ticket.full_name || ticket.customer_username} />
                    <Field label="Contact" value={ticket.contact_number} />
                    <Field label="Partner Installer" value={ticket.partner_installer_username || "—"} />
                    <Field label="Address" value={ticket.property_address} />
                    <Field
                      label="Date Submitted"
                      value={new Date(ticket.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                    />
                    <Field label="Preferred Package" value={ticket.solar_package} />
                    <Field label="System Type" value={ticket.system_type === "ON_GRID" ? "On-Grid" : "Hybrid"} />
                  </div>
                </section>

                {assessment && (
                  <section className="stfcd-section">
                    <h2>Roof Assessment Data</h2>
                    <div className="stfcd-grid stfcd-grid-4">
                      <Field label="Roof Area" value={`${assessment.estimated_roof_area_sqm} sq.m.`} />
                      <Field label="Roof Type" value={assessment.roof_type_display} />
                      <Field label="Condition" value={assessment.roof_condition_display} />
                      <Field label="Rec. Package" value={assessment.recommended_package} />
                      <Field label="System Type" value={assessment.recommended_system_type_display} />
                      <Field label="Capacity" value={`${assessment.rated_capacity_kw} kW`} />
                      <Field label="Solar Panels" value={`${assessment.number_of_solar_panels} pcs`} />
                      <Field label="Inverter" value={`${assessment.inverter_size_kw} kW`} />
                    </div>

                    {assessment.notes && (
                      <div className="stfcd-notes-box">
                        <h3>Worker Notes</h3>
                        <p>{assessment.notes}</p>
                      </div>
                    )}
                  </section>
                )}

                {finalSheet && (
                  <section className="stfcd-section">
                    <h2>Final Cost &amp; Payment Terms</h2>
                    <div className="stfcd-cost-columns">
                      <div className="stfcd-final-price-box">
                        <label>Final Price</label>
                        <p>{formatCurrency(finalSheet.final_cost)}</p>
                      </div>
                      <div className="stfcd-payment-box">
                        <label>Payment Terms</label>
                        <p>{finalSheet.payment_terms_summary}</p>
                      </div>
                    </div>
                  </section>
                )}
                           </div>
            </div>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}