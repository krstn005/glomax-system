import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarX2,
  CalendarDays,
  CalendarCheck,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  HardHat,
  MousePointerClick,
} from "lucide-react";
import StaffLayout from "../components/StaffLayout";
import { getStaffCalendarTickets } from "../../../api/staffTickets";
import FilterMenu from "../../../components/FilterMenu";
import "../styles/staff-calendar.css";

// Which color group each ticket status belongs to
const STATUS_GROUP = {
  APPROVED: "approved",
  COMPLETED: "approved",
  NC_CANNOT_PROCEED: "not-compatible",
  NC_CAN_REAPPLY: "not-compatible",
  PI_ASSIGNED: "in-progress",
  ASSESSMENT_SUBMITTED: "in-progress",
  STAFF_REVIEW: "in-progress",
  ADMIN_REVIEW: "in-progress",
};

// Filter options - shown in the Filter drop-down button.
// statusGroup is the color group the option shows (null = all).
const FILTERS = [
  { key: "ALL", label: "All Visits", statusGroup: null, icon: Layers, tone: "navy" },
  { key: "IN_PROGRESS", label: "In Progress", statusGroup: "in-progress", icon: Clock, tone: "blue" },
  { key: "APPROVED", label: "Approved / Completed", statusGroup: "approved", icon: CheckCircle2, tone: "green" },
  { key: "NOT_COMPATIBLE", label: "Not Compatible", statusGroup: "not-compatible", icon: XCircle, tone: "red" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// How many chips to show inside one day before "+N more"
const MAX_CHIPS_PER_DAY = 2;

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
  return ticket.full_name || ticket.customer_username;
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

export default function StaffCalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [monthTickets, setMonthTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [selectedKey, setSelectedKey] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(viewYear);
  const pickerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getStaffCalendarTickets(viewMonth + 1, viewYear);
        if (cancelled) return;
        const sorted = [...data].sort((a, b) => a.visit_date.localeCompare(b.visit_date));
        setMonthTickets(sorted);
        setError("");
      } catch {
        if (!cancelled) setError("Could not load the calendar. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [viewMonth, viewYear, reloadKey]);

  // Closes the month picker when you click outside it or press Esc
  useEffect(() => {
    function handleClickOutside(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function changeMonth(year, month) {
    setViewYear(year);
    setViewMonth(month);
    setSelectedKey(null);
  }

  function goToPreviousMonth() {
    if (viewMonth === 0) changeMonth(viewYear - 1, 11);
    else changeMonth(viewYear, viewMonth - 1);
  }

  function goToNextMonth() {
    if (viewMonth === 11) changeMonth(viewYear + 1, 0);
    else changeMonth(viewYear, viewMonth + 1);
  }

  function goToToday() {
    changeMonth(today.getFullYear(), today.getMonth());
    setSelectedKey(todayKey);
  }

  function openPicker() {
    setPickerYear(viewYear);
    setPickerOpen(true);
  }

  function selectMonth(monthIndex) {
    changeMonth(pickerYear, monthIndex);
    setPickerOpen(false);
  }

  function toggleDay(key) {
    setSelectedKey((current) => (current === key ? null : key));
  }

  function openTicket(id) {
    navigate(`/staff/manage-tickets/${id}`);
  }

  function refresh() {
    setError("");
    setReloadKey((k) => k + 1);
  }

  // Counts for the Filter list (this month only)
  const filterCounts = {};
  FILTERS.forEach((f) => {
    filterCounts[f.key] = f.statusGroup
      ? monthTickets.filter((t) => getGroup(t) === f.statusGroup).length
      : monthTickets.length;
  });

  const currentFilter = FILTERS.find((f) => f.key === activeFilter) || FILTERS[0];
  const visibleTickets = currentFilter.statusGroup
    ? monthTickets.filter((t) => getGroup(t) === currentFilter.statusGroup)
    : monthTickets;

  const ticketsByDate = {};
  visibleTickets.forEach((t) => {
    const key = t.visit_date.slice(0, 10);
    if (!ticketsByDate[key]) ticketsByDate[key] = [];
    ticketsByDate[key].push(t);
  });

  // Calendar grid: blank cells first so the 1st lands on its real weekday,
  // then blank cells at the end so the last row is full
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

  // Next visit (for the banner text)
  const nextVisit = monthTickets.find((t) => t.visit_date.slice(0, 10) >= todayKey);
  const todayCount = monthTickets.filter((t) => t.visit_date.slice(0, 10) === todayKey).length;

  let heroText;
  if (loading) {
    heroText = `Loading visits for ${monthLabel}...`;
  } else if (error) {
    heroText = "Visits could not be loaded right now.";
  } else if (monthTickets.length === 0) {
    heroText = `No Partner Installer visits are scheduled for ${monthLabel}.`;
  } else if (isCurrentMonth && todayCount > 0) {
    heroText = `${todayCount} visit${todayCount === 1 ? "" : "s"} today · ${monthTickets.length} this month.`;
  } else if (isCurrentMonth && nextVisit) {
    const [, m, d] = nextVisit.visit_date.slice(0, 10).split("-").map(Number);
    heroText = `Next visit: ${getName(nextVisit)} on ${MONTH_SHORT[m - 1]} ${d} · ${monthTickets.length} this month.`;
  } else {
    heroText = `${monthTickets.length} visit${monthTickets.length === 1 ? "" : "s"} scheduled in ${monthLabel}.`;
  }

  // Side panel list
  let panelTitle;
  let panelHint;
  let panelTickets;
  if (selectedKey) {
    const [y, m, d] = selectedKey.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    panelTitle = `${MONTH_SHORT[m - 1]} ${d}, ${y}`;
    panelHint = `${WEEKDAY_FULL[weekday]} · ${getDayDistance(selectedKey, todayKey)}`;
    panelTickets = ticketsByDate[selectedKey] || [];
  } else if (isCurrentMonth) {
    panelTitle = "Upcoming Visits";
    panelHint = `From today until the end of ${MONTH_NAMES[viewMonth]}`;
    panelTickets = visibleTickets.filter((t) => t.visit_date.slice(0, 10) >= todayKey);
  } else {
    panelTitle = "Visits This Month";
    panelHint = monthLabel;
    panelTickets = visibleTickets;
  }

  return (
    <StaffLayout pageTitle="Calendar" pageSubtitle="All scheduled Partner Installer visits at a glance">
      <div className="stfcal-page">
        {/* ---------- Banner ---------- */}
        <section className="stfcal-hero">
          <div className="stfcal-hero-glow" aria-hidden="true" />
          <div className="stfcal-hero-icon">
            <CalendarDays size={26} />
          </div>
          <div className="stfcal-hero-text">
            <h1>Visit Calendar</h1>
            <p>{heroText}</p>
          </div>
          <div className="stfcal-hero-actions">
            {!(isCurrentMonth && selectedKey === todayKey) && (
              <button type="button" className="stfcal-hero-btn gold" onClick={goToToday}>
                <CalendarCheck size={16} />
                Go to today
              </button>
            )}
            <button type="button" className="stfcal-hero-btn glass" onClick={refresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </section>

        <div className="stfcal-layout">
          {/* ---------- Calendar ---------- */}
          <section className="stfcal-card">
            <div className="stfcal-header">
              <div className="stfcal-title-group" ref={pickerRef}>
                <button
                  type="button"
                  className={`stfcal-title-btn ${pickerOpen ? "open" : ""}`}
                  onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                  aria-expanded={pickerOpen}
                  aria-label="Choose a month"
                >
                  <span className="stfcal-title-icon">
                    <CalendarDays size={18} />
                  </span>
                  <span className="stfcal-title-text">
                    <span className="stfcal-month-label">{MONTH_NAMES[viewMonth]}</span>
                    <span className="stfcal-year-label">{viewYear}</span>
                  </span>
                  <ChevronDown size={18} className="stfcal-title-chevron" />
                </button>

                {pickerOpen && (
                  <div className="stfcal-picker-dropdown">
                    <div className="stfcal-picker-year-row">
                      <button
                        type="button"
                        className="stfcal-picker-year-btn"
                        onClick={() => setPickerYear((y) => y - 1)}
                        aria-label="Previous year"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="stfcal-picker-year-label">{pickerYear}</span>
                      <button
                        type="button"
                        className="stfcal-picker-year-btn"
                        onClick={() => setPickerYear((y) => y + 1)}
                        aria-label="Next year"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="stfcal-picker-month-grid">
                      {MONTH_SHORT.map((name, index) => {
                        const isActive = index === viewMonth && pickerYear === viewYear;
                        const isNow = index === today.getMonth() && pickerYear === today.getFullYear();
                        return (
                          <button
                            key={name}
                            type="button"
                            className={`stfcal-picker-month-option ${isActive ? "active" : ""} ${
                              isNow ? "now" : ""
                            }`}
                            onClick={() => selectMonth(index)}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className={`stfcal-tools ${activeFilter !== "ALL" ? "filtered" : ""}`}>
                <FilterMenu
                  options={FILTERS}
                  activeKey={activeFilter}
                  counts={loading || error ? {} : filterCounts}
                  onPick={setActiveFilter}
                  ariaLabel="Filter visits"
                />
              </div>

              <div className="stfcal-header-right">
                {!loading && !error && (
                  <span className="stfcal-count">
                    <strong>{visibleTickets.length}</strong> visit{visibleTickets.length === 1 ? "" : "s"}
                  </span>
                )}
                <div className="stfcal-nav">
                  <button type="button" className="stfcal-nav-btn" onClick={goToPreviousMonth} aria-label="Previous month">
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" className="stfcal-today-btn" onClick={goToToday}>
                    Today
                  </button>
                  <button type="button" className="stfcal-nav-btn" onClick={goToNextMonth} aria-label="Next month">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="stfcal-body">
              {error ? (
                <div className="stfcal-empty-state">
                  <span className="stfcal-empty-badge stfcal-empty-badge-red">
                    <AlertCircle size={26} />
                  </span>
                  <p className="stfcal-empty-title">Something went wrong</p>
                  <p className="stfcal-empty-hint">{error}</p>
                  <button type="button" className="stfcal-btn-primary" onClick={refresh}>
                    <RefreshCw size={15} />
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="stfcal-weekday-row">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <div key={label} className={`stfcal-weekday ${i === 0 || i === 6 ? "weekend" : ""}`}>
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="stfcal-grid">
                    {cells.map((day, index) => {
                      if (day === null) {
                        return <div key={`blank-${index}`} className="stfcal-cell stfcal-cell-blank" />;
                      }

                      const dateKey = formatDateKey(viewYear, viewMonth, day);

                      if (loading) {
                        return (
                          <div key={dateKey} className="stfcal-cell stfcal-cell-loading">
                            <span className="stfcal-skel stfcal-skel-num" />
                          </div>
                        );
                      }

                      const dayTickets = ticketsByDate[dateKey] || [];
                      const weekday = (firstWeekday + day - 1) % 7;
                      const isWeekend = weekday === 0 || weekday === 6;
                      const isToday = dateKey === todayKey;
                      const isPast = dateKey < todayKey;
                      const isSelected = dateKey === selectedKey;
                      const extra = dayTickets.length - MAX_CHIPS_PER_DAY;

                      const classes = [
                        "stfcal-cell",
                        isWeekend ? "weekend" : "",
                        isPast ? "past" : "",
                        isToday ? "today" : "",
                        isSelected ? "selected" : "",
                        dayTickets.length > 0 ? "has-visits" : "",
                      ].join(" ");

                      return (
                        <div
                          key={dateKey}
                          className={classes}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          aria-label={`${MONTH_NAMES[viewMonth]} ${day}, ${dayTickets.length} visit${
                            dayTickets.length === 1 ? "" : "s"
                          }`}
                          onClick={() => toggleDay(dateKey)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleDay(dateKey);
                            }
                          }}
                        >
                          <span className="stfcal-cell-top">
                            <span className="stfcal-day-number">{day}</span>
                            {isToday && <span className="stfcal-today-tag">Today</span>}
                            {dayTickets.length > 0 && (
                              <span className="stfcal-day-count">{dayTickets.length}</span>
                            )}
                          </span>
                          <div className="stfcal-day-tickets">
                            {dayTickets.slice(0, MAX_CHIPS_PER_DAY).map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                className={`stfcal-chip ${getGroup(t)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTicket(t.id);
                                }}
                                title={`${t.ticket_number} - ${getName(t)} - ${t.status_display}`}
                              >
                                <span className="stfcal-chip-id">{t.ticket_number}</span>
                                <span className="stfcal-chip-text">{getName(t)}</span>
                              </button>
                            ))}
                            {extra > 0 && <span className="stfcal-more">+{extra} more</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="stfcal-footer">
              <div className="stfcal-legend">
                <span className="stfcal-legend-item">
                  <span className="stfcal-legend-dot in-progress" />
                  In Progress
                </span>
                <span className="stfcal-legend-item">
                  <span className="stfcal-legend-dot approved" />
                  Approved / Completed
                </span>
                <span className="stfcal-legend-item">
                  <span className="stfcal-legend-dot not-compatible" />
                  Not Compatible
                </span>
              </div>
              <span className="stfcal-footer-tip">
                <MousePointerClick size={14} />
                Click a day to see its visits
              </span>
            </div>
          </section>

          {/* ---------- Side panel ---------- */}
          <aside className="stfcal-panel">
            <div className="stfcal-panel-header">
              <span className="stfcal-panel-icon">
                {selectedKey ? <CalendarCheck size={18} /> : <CalendarDays size={18} />}
              </span>
              <div className="stfcal-panel-title">
                <h3>{panelTitle}</h3>
                <p>{panelHint}</p>
              </div>
              {!loading && !error && <span className="stfcal-panel-count">{panelTickets.length}</span>}
            </div>

            {selectedKey && (
              <div className="stfcal-panel-chips">
                <button type="button" className="stfcal-panel-chip" onClick={() => setSelectedKey(null)}>
                  Show whole month
                  <XCircle size={13} />
                </button>
              </div>
            )}

            <div className="stfcal-panel-body">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="stfcal-visit stfcal-visit-skeleton">
                    <span className="stfcal-skel stfcal-skel-date" />
                    <div className="stfcal-skel-stack">
                      <span className="stfcal-skel stfcal-skel-w-md" />
                      <span className="stfcal-skel stfcal-skel-w-sm" />
                    </div>
                  </div>
                ))
              ) : error ? (
                <p className="stfcal-panel-empty">Visits could not be loaded.</p>
              ) : panelTickets.length === 0 ? (
                <div className="stfcal-panel-empty-state">
                  <span className="stfcal-panel-empty-icon">
                    <CalendarX2 size={24} />
                  </span>
                  <strong>
                    {selectedKey
                      ? "No visits on this day"
                      : isCurrentMonth
                      ? "No more visits this month"
                      : "No visits this month"}
                  </strong>
                  <p>
                    {selectedKey
                      ? "Pick another day, or show the whole month."
                      : "Use the arrows to check other months."}
                  </p>
                </div>
              ) : (
                panelTickets.map((t) => {
                  const dateKey = t.visit_date.slice(0, 10);
                  const [, m, d] = dateKey.split("-").map(Number);
                  const group = getGroup(t);
                  const isToday = dateKey === todayKey;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`stfcal-visit ${group}`}
                      onClick={() => openTicket(t.id)}
                    >
                      <span className={`stfcal-visit-date ${isToday ? "today" : ""}`}>
                        <span className="stfcal-visit-month">{MONTH_SHORT[m - 1]}</span>
                        <span className="stfcal-visit-day">{d}</span>
                      </span>
                      <span className="stfcal-visit-info">
                        <span className="stfcal-visit-name">{getName(t)}</span>
                        <span className="stfcal-visit-meta">
                          <span className="stfcal-visit-ticket">{t.ticket_number}</span>
                          <span className="stfcal-visit-when">{getDayDistance(dateKey, todayKey)}</span>
                        </span>
                        {t.partner_installer_username && (
                          <span className="stfcal-visit-installer">
                            <HardHat size={12} />
                            {t.partner_installer_username}
                          </span>
                        )}
                        <span className={`stfcal-visit-badge ${group}`}>
                          <span className="stfcal-visit-dot" />
                          {t.status_display}
                        </span>
                      </span>
                      <ArrowRight size={16} className="stfcal-visit-arrow" />
                    </button>
                  );
                })
              )}
            </div>

            <p className="stfcal-panel-footnote">Click a visit to open the ticket.</p>
          </aside>
        </div>
      </div>
    </StaffLayout>
  );
}
