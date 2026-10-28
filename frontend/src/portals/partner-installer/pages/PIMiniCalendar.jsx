import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ArrowRight, CalendarX2, RefreshCw } from "lucide-react";
import { getInstallerCalendarTickets } from "../../../api/piTickets";
import "../styles/pi-mini-calendar.css";

// Same color groups as the Calendar page
const STATUS_GROUP = {
  PI_ASSIGNED: "assigned",
  APPROVED: "approved",
  COMPLETED: "approved",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  ASSESSMENT_SUBMITTED: "in-progress",
  STAFF_REVIEW: "in-progress",
  ADMIN_REVIEW: "in-progress",
};

// The order the little dots show in under a day number
const GROUP_ORDER = ["assigned", "in-progress", "approved", "not-compatible"];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

// How many visits to list under the calendar
const MAX_LISTED = 3;

// The calendar checks for new visits by itself every 30 seconds
const REFRESH_MS = 30000;

// Builds "YYYY-MM-DD" by hand. Do not use toISOString() here - it
// converts to UTC first, which can move the date back a day in the
// Philippines (UTC+8).
function formatDateKey(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function getGroup(ticket) {
  return STATUS_GROUP[ticket.status] || "in-progress";
}

function getName(ticket) {
  return ticket.full_name || ticket.customer_username || "Customer";
}

// "Today", "Tomorrow", "In 3 days", "2 days ago"
function getDayDistance(dateKey, todayKey) {
  const [y1, m1, d1] = dateKey.split("-").map(Number);
  const [y2, m2, d2] = todayKey.split("-").map(Number);
  const diff = Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export default function PIMiniCalendar() {
  const navigate = useNavigate();
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(isInitial) {
      try {
        if (isInitial) setLoading(true);
        const data = await getInstallerCalendarTickets(viewMonth + 1, viewYear);
        if (cancelled) return;
        setVisits([...data].sort((a, b) => a.visit_date.localeCompare(b.visit_date)));
        setError(false);
      } catch {
        if (isInitial && !cancelled) setError(true);
      } finally {
        if (isInitial && !cancelled) setLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => {
      if (!document.hidden) load(false);
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [viewMonth, viewYear, reloadKey]);

  function goToPreviousMonth() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function goToThisMonth() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  // Opens the Calendar page. With a day, it opens on that day. Without
  // one, it opens on the month shown here.
  function openCalendar(dateKey) {
    if (dateKey) {
      navigate(`/partner-installer/calendar?date=${dateKey}`);
    } else if (isCurrentMonth) {
      navigate("/partner-installer/calendar");
    } else {
      navigate(`/partner-installer/calendar?month=${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`);
    }
  }

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // Which days have visits, and which colors to show as dots
  const byDate = {};
  visits.forEach((t) => {
    const key = t.visit_date.slice(0, 10);
    if (!byDate[key]) byDate[key] = { count: 0, groups: [] };
    byDate[key].count += 1;
    const group = getGroup(t);
    if (!byDate[key].groups.includes(group)) byDate[key].groups.push(group);
  });
  Object.values(byDate).forEach((entry) => {
    entry.groups.sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  });

  // Calendar grid: blank cells first so the 1st lands on its real weekday
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // The short list under the calendar
  const listSource = isCurrentMonth
    ? visits.filter((t) => t.visit_date.slice(0, 10) >= todayKey)
    : visits;
  const listed = listSource.slice(0, MAX_LISTED);
  const hiddenCount = listSource.length - listed.length;
  const listTitle = isCurrentMonth ? "Upcoming visits" : `Visits in ${MONTH_NAMES[viewMonth]}`;

  return (
    <section className="pid-card pimc">
      <div className="pid-side-head">
        <h2>Visit calendar</h2>
        <button type="button" className="pimc-viewall" onClick={() => openCalendar()}>
          View all
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="pimc-nav">
        <button type="button" className="pimc-nav-btn" onClick={goToPreviousMonth} aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <div className="pimc-nav-title">
          <span className="pimc-month">{MONTH_NAMES[viewMonth]} {viewYear}</span>
          {!isCurrentMonth && (
            <button type="button" className="pimc-today-btn" onClick={goToThisMonth}>
              This month
            </button>
          )}
        </div>
        <button type="button" className="pimc-nav-btn" onClick={goToNextMonth} aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="pimc-weekdays" aria-hidden="true">
        {WEEKDAY_LETTERS.map((letter, i) => (
          <span key={i}>{letter}</span>
        ))}
      </div>

      <div className="pimc-grid">
        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} className="pimc-blank" />;

          const dateKey = formatDateKey(viewYear, viewMonth, day);
          const entry = loading || error ? null : byDate[dateKey];
          const classes = [
            "pimc-day",
            dateKey === todayKey ? "today" : "",
            dateKey < todayKey ? "past" : "",
            entry ? "has-visits" : "",
          ].join(" ");

          return (
            <button
              key={dateKey}
              type="button"
              className={classes}
              onClick={() => openCalendar(dateKey)}
              aria-label={`${MONTH_NAMES[viewMonth]} ${day}${
                entry ? `, ${entry.count} visit${entry.count === 1 ? "" : "s"}` : ""
              }. Open the calendar.`}
            >
              <span className="pimc-day-num">{day}</span>
              <span className="pimc-dots">
                {entry && entry.groups.map((g) => <span key={g} className={`pimc-dot ${g}`} />)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="pimc-legend">
        <span className="pimc-legend-item"><span className="pimc-dot assigned" />Assigned</span>
        <span className="pimc-legend-item"><span className="pimc-dot in-progress" />In progress</span>
        <span className="pimc-legend-item"><span className="pimc-dot approved" />Approved / Completed</span>
        <span className="pimc-legend-item"><span className="pimc-dot not-compatible" />Not compatible</span>
      </div>

      <div className="pimc-list">
        <p className="pimc-list-title">{listTitle}</p>

        {loading ? (
          <div className="pid-skel-stack">
            <span className="pid-skel pid-skel-todo" />
          </div>
        ) : error ? (
          <div className="pimc-error">
            <p>Could not load the visits.</p>
            <button type="button" className="pimc-retry" onClick={() => setReloadKey((k) => k + 1)}>
              <RefreshCw size={13} />
              Try again
            </button>
          </div>
        ) : listed.length === 0 ? (
          <p className="pid-side-empty">
            <CalendarX2 size={16} />
            {isCurrentMonth ? "No more visits this month." : `No visits in ${MONTH_NAMES[viewMonth]}.`}
          </p>
        ) : (
          <ul className="pid-visits">
            {listed.map((t) => {
              const dateKey = t.visit_date.slice(0, 10);
              const [, m, d] = dateKey.split("-").map(Number);
              const when = getDayDistance(dateKey, todayKey);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    className="pid-visit"
                    onClick={() => navigate(`/partner-installer/incoming-tickets/${t.id}`)}
                  >
                    <span className="pid-visit-cal">
                      <span>{MONTH_SHORT[m - 1]}</span>
                      <strong>{d}</strong>
                    </span>
                    <span className="pid-visit-text">
                      <strong>{getName(t)}</strong>
                      <span>{t.property_address || t.ticket_number}</span>
                    </span>
                    <span className={`pid-visit-when ${when === "Today" || when === "Tomorrow" ? "soon" : ""}`}>
                      {when}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!loading && !error && hiddenCount > 0 && (
          <button type="button" className="pid-side-link" onClick={() => openCalendar()}>
            See {hiddenCount} more <ArrowRight size={14} />
          </button>
        )}
      </div>
    </section>
  );
}