// "When can the customer reapply?" box.
// Used in the Staff decision popup and in the Enable Reapply popup.
// Staff taps Now, 14, 30 or 60 days, types their own number of days,
// or picks a date. The value is always kept as a number of days from
// today (0 = right away), and the exact date is shown under it.

export const DEFAULT_REAPPLY_DAYS = 30;
const QUICK_DAYS = [0, 14, 30, 60];
const MS_PER_DAY = 86400000;

export function parseDays(value) {
  if (String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 365 ? n : null;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function dateAfter(days) {
  const date = startOfToday();
  date.setDate(date.getDate() + days);
  return date;
}

function dateText(days) {
  return dateAfter(days).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function ReapplyDaysField({ value, onChange, disabled = false }) {
  const days = parseDays(value);

  const chip = (active) => ({
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    border: `1px solid ${active ? "#0d1f3c" : "#d1d5db"}`,
    background: active ? "#0d1f3c" : "#ffffff",
    color: active ? "#ffffff" : "#374151",
  });

  // Picking a date turns it into days from today
  function handleDatePick(e) {
    const picked = e.target.value;
    if (!picked) return;
    const [y, m, d] = picked.split("-").map(Number);
    const diff = Math.round((new Date(y, m - 1, d) - startOfToday()) / MS_PER_DAY);
    if (diff >= 0) onChange(String(diff));
  }

  return (
    <div style={{ textAlign: "left", margin: "6px 0 0" }}>
      <label
        htmlFor="reapply-days"
        style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}
      >
        When can the customer reapply?
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {QUICK_DAYS.map((d) => (
          <button
            key={d}
            type="button"
            style={chip(days === d)}
            onClick={() => onChange(String(d))}
            disabled={disabled}
          >
            {d === 0 ? "Now" : `In ${d} days`}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 10 }}>
        <span style={{ fontSize: 13, color: "#374151" }}>Or pick:</span>
        <input
          type="date"
          min={dateKey(startOfToday())}
          value={days === null ? "" : dateKey(dateAfter(days))}
          onChange={handleDatePick}
          disabled={disabled}
          aria-label="Date the customer can reapply"
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            fontSize: 14,
          }}
        />
        <input
          id="reapply-days"
          type="number"
          min="0"
          max="365"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Number of days"
          style={{
            width: 70,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${days !== null ? "#d1d5db" : "#ef4444"}`,
            fontSize: 14,
          }}
        />
        <span style={{ fontSize: 13, color: "#374151" }}>days from today</span>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: days !== null ? "#6b7280" : "#b91c1c" }}>
        {days === null
          ? "Enter a number from 0 to 365."
          : days === 0
          ? "The customer can reapply right away."
          : `The customer can reapply starting ${dateText(days)}. Before that, the Reapply button is blocked.`}
      </p>
    </div>
  );
}