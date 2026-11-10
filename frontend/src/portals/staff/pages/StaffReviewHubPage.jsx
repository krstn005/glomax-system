import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardList, Receipt } from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import StaffAssessmentReviewPage from "./StaffAssessmentReviewPage";
import StaffQuotationManagementPage from "./StaffQuotationManagementPage";
import { getAssessmentReviewPage } from "../../../api/staffTickets";
import "../styles/staff-review-hub.css";

const TABS = ["assessments", "quotations"];
const SAVED_KEY = "staffReviewTab";

function readSavedTab() {
  try {
    const saved = sessionStorage.getItem(SAVED_KEY);
    return TABS.includes(saved) ? saved : null;
  } catch {
    return null;
  }
}

// One page for both lists. "Assessments" and "Quotations" are tabs.
// The tab is kept in the address (?tab=quotations) and remembered,
// so coming back from a ticket opens the same tab again.
export default function StaffReviewHubPage() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("tab");
  const tab = TABS.includes(fromUrl) ? fromUrl : readSavedTab() || "assessments";
  const [needsReview, setNeedsReview] = useState(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(SAVED_KEY, tab);
    } catch {
      // Remembering the tab is optional.
    }
  }, [tab]);

  // Small number on the Assessments tab
  useEffect(() => {
    let cancelled = false;
    getAssessmentReviewPage(1, "NEEDS_REVIEW")
      .then((data) => {
        if (!cancelled) setNeedsReview(Array.isArray(data) ? data.length : Number(data?.count || 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab]);

  function pickTab(next) {
    setParams({ tab: next }, { replace: true });
  }

  return (
    <StaffLayout
      pageTitle="Assessment & Quotation"
      pageSubtitle="Review roof assessments and manage quotations in one place"
    >
      <div className="stfhub-tabs" role="tablist" aria-label="Choose a list">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "assessments"}
          className={`stfhub-tab ${tab === "assessments" ? "active" : ""}`}
          onClick={() => pickTab("assessments")}
        >
          <ClipboardList size={16} />
          Assessments
          {needsReview > 0 && <span className="stfhub-tab-badge">{needsReview > 99 ? "99+" : needsReview}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "quotations"}
          className={`stfhub-tab ${tab === "quotations" ? "active" : ""}`}
          onClick={() => pickTab("quotations")}
        >
          <Receipt size={16} />
          Quotations
        </button>
      </div>

      {tab === "assessments" ? (
        <StaffAssessmentReviewPage key="assessments" embedded />
      ) : (
        <StaffQuotationManagementPage key="quotations" embedded />
      )}
    </StaffLayout>
  );
}