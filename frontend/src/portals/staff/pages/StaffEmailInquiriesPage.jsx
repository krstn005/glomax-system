import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getInquiries } from "../../../api/inquiries";
import "../styles/staff-email-inquiries.css";

const STATUS_FILTERS = ["All", "Pending", "Replied"];
const POLL_INTERVAL_MS = 15000;

export default function StaffEmailInquiriesPage() {
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        const data = await getInquiries();
        if (cancelled) return;
        setInquiries(data);
        if (isInitial) setError("");
      } catch {
        if (isInitial) setError("Could not load inquiries. Please try again.");
      } finally {
        if (isInitial) setLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => load(false), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const filteredInquiries = inquiries.filter((inq) => {
    const rawTerm = searchTerm.trim().toLowerCase();
    const isNumericSearch = /^#?\d+$/.test(rawTerm);

    let matchesSearch = true;
    if (rawTerm) {
      if (isNumericSearch) {
        const numericTerm = rawTerm.replace(/^#/, "");
        matchesSearch = String(inq.id) === numericTerm;
      } else {
        matchesSearch =
          inq.full_name.toLowerCase().includes(rawTerm) ||
          inq.email.toLowerCase().includes(rawTerm);
      }
    }

    const matchesStatus =
      statusFilter === "All" ||
      (statusFilter === "Replied" && inq.quotation_sent) ||
      (statusFilter === "Pending" && !inq.quotation_sent);

    return matchesSearch && matchesStatus;
  });

  return (
    <StaffLayout pageTitle="Email Inquiries" pageSubtitle="Manage incoming customer inquiries">
      <div className="stfinq-toolbar">
        <div className="stfinq-filters">
          <div className="stfinq-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by name, email, or inquiry #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="stfinq-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p className="stfinq-error">{error}</p>}

      {!loading && !error && (
        <div className="stfinq-table-card">
          {filteredInquiries.length === 0 ? (
            <p className="stfinq-empty">
              {searchTerm || statusFilter !== "All"
                ? "No inquiries match your search or filter."
                : "No inquiries received yet."}
            </p>
          ) : (
            <table className="stfinq-table">
              <thead>
                <tr>
                  <th>Inquiry #</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Subject</th>
                  <th>Date Received</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInquiries.map((inq) => (
                  <tr
                    key={inq.id}
                    className="stfinq-row-clickable"
                    onClick={() => navigate(`/staff/email-inquiries/${inq.id}/quotation`)}
                  >
                    <td className="stfinq-td-strong">#{inq.id}</td>
                    <td className="stfinq-td-strong">{inq.full_name}</td>
                    <td>{inq.email}</td>
                    <td>{inq.subject_display}</td>
                    <td>{new Date(inq.received_at).toLocaleDateString()}</td>
                                        <td>
                      <span className={`stfinq-status ${inq.quotation_sent ? "replied" : "pending"}`}>
                        <span className="stfinq-status-dot" />
                        {inq.quotation_sent ? "Replied" : "Pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </StaffLayout>
  );
}