import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import '../styles/visit-calendar.css';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Builds "YYYY-MM-DD" from the local date. Do not use toISOString() here -
// in the Philippines (UTC+8) it would give the day before.
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatShort(key) {
  return keyToDate(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// value and minDate are "YYYY-MM-DD" strings. Days before minDate
// are grayed out and can't be picked (minDate defaults to today).
export default function VisitCalendar({ value, onChange, minDate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toDateKey(today);
  const minKey = minDate || todayKey;
  const minDateObj = keyToDate(minKey);

  const startDate = value ? keyToDate(value) : minDateObj;
  const [viewYear, setViewYear] = useState(startDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(startDate.getMonth());

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const canGoBack =
    new Date(viewYear, viewMonth, 1) > new Date(minDateObj.getFullYear(), minDateObj.getMonth(), 1);

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function pickEarliest() {
    setViewYear(minDateObj.getFullYear());
    setViewMonth(minDateObj.getMonth());
    onChange(minKey);
  }

  return (
    <div className="vc-cal">
      <div className="vc-header">
        <button
          type="button"
          className="vc-nav"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="vc-title">{monthLabel}</span>
        <button
          type="button"
          className="vc-nav"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="vc-body">
        <div className="vc-weekdays">
          {WEEKDAYS.map((w) => (
            <span key={w} className="vc-weekday">{w}</span>
          ))}
        </div>

        <div className="vc-grid">
          {cells.map((day, index) => {
            if (day === null) {
              return <span key={`blank-${index}`} className="vc-blank" />;
            }
            const key = toDateKey(new Date(viewYear, viewMonth, day));
            const classes = [
              'vc-day',
              key === todayKey ? 'today' : '',
              key === value ? 'selected' : '',
            ].join(' ');
            return (
              <button
                key={key}
                type="button"
                className={classes}
                disabled={key < minKey}
                onClick={() => onChange(key)}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="vc-footer">
        <span className="vc-selected">
          {value ? <strong>{formatShort(value)}</strong> : 'No date picked yet'}
        </span>
        <button type="button" className="vc-quick-btn" onClick={pickEarliest}>
          {minKey === todayKey ? 'Today' : 'Earliest date'}
        </button>
      </div>
    </div>
  );
}