// "How many days can the customer reapply?" box.
// Used in the Staff decision popup and in the Enable Reapply popup.
// Starts at 30 days. Staff can tap 14, 30 or 60, or type their own number.

export const DEFAULT_REAPPLY_DAYS = 30;
const QUICK_DAYS = [14, 30, 60];

export function parseDays(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : null;
}

function lastDayText(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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

  return (
    <div style={{ textAlign: "left", margin: "6px 0 0" }}>
      <label
        htmlFor="reapply-days"
        style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}
      >
        Days the customer can reapply
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
            {d} days
          </button>
        ))}
        <input
          id="reapply-days"
          type="number"
          min="1"
          max="365"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Number of days"
          style={{
            width: 80,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${days ? "#d1d5db" : "#ef4444"}`,
            fontSize: 14,
          }}
        />
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: days ? "#6b7280" : "#b91c1c" }}>
        {days
          ? `Last day to reapply: ${lastDayText(days)}`
          : "Enter a number from 1 to 365."}
      </p>
    </div>
  );
}