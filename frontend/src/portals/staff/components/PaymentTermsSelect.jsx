import { useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronDown, Check, X } from "lucide-react";

// A payment term can be long, like
// "30% Upon Downpayment, 20% Upon Mobilization, 45% Upon Completion".
// This splits it into its parts, and each part into a percent and a label,
// so it can be shown as a small table instead of one long sentence.
function parseTerms(text) {
  return String(text || "")
    .split(/,\s*(?=\d)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+(?:\.\d+)?)\s*%\s*(.*)$/);
      if (!match) return { percent: null, label: part };
      return { percent: Number(match[1]), label: match[2] || "" };
    });
}

const SEGMENT_COLORS = ["#0d1f3c", "#eab308", "#2563eb", "#16a34a", "#a855f7"];

// The bar and the list for one payment term
function TermsBreakdown({ description }) {
  const parts = parseTerms(description);
  const hasBar = parts.length > 0 && parts.every((p) => p.percent !== null);

  return (
    <div className="pts-breakdown">
      {hasBar && (
        <div className="pts-bar" aria-hidden="true">
          {parts.map((p, i) => (
            <span
              key={i}
              style={{ flexGrow: p.percent, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
          ))}
        </div>
      )}
      <ul className="pts-rows">
        {parts.map((p, i) => (
          <li key={i} className="pts-row">
            {p.percent !== null ? (
              <>
                <span
                  className="pts-pct"
                  style={{ "--seg": SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                >
                  {p.percent}%
                </span>
                <span className="pts-label">{p.label}</span>
              </>
            ) : (
              <span className="pts-label">{p.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CSS = `
.pts { position: relative; }

/* ---- Button ---- */
.pts-btn {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px;
  padding: 0 12px 0 10px; border: 1.5px solid #e2e8f0; border-radius: 12px;
  background: #fff; font-family: inherit; font-size: 14px; color: #0f172a;
  text-align: left; cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.pts-btn:hover:not(:disabled) { border-color: #cbd5e1; }
.pts-btn:disabled { opacity: .6; cursor: not-allowed; }
.pts-btn.open, .pts-btn:focus-visible {
  outline: none; border-color: #facc15;
  box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.2);
}
.pts-btn-icon {
  width: 30px; height: 30px; flex-shrink: 0; display: grid; place-items: center;
  border-radius: 9px; background: #0d1f3c; color: #facc15;
}
.pts-btn-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pts-btn-text.placeholder { color: #94a3b8; }
.pts-chevron { flex-shrink: 0; color: #64748b; transition: transform .2s ease; }
.pts-btn.open .pts-chevron { transform: rotate(180deg); }

/* ---- Menu ---- */
.pts-menu {
  position: absolute; top: calc(100% + 8px); left: 0; right: 0; z-index: 60;
  max-height: 360px; overflow-y: auto; padding: 8px;
  border: 1px solid #e5e9f0; border-radius: 16px; background: #fff;
  box-shadow: 0 22px 48px rgba(13, 31, 60, 0.2);
  animation: ptsPop .16s ease-out;
}
@keyframes ptsPop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.pts-menu-title {
  margin: 2px 6px 8px; font-size: 11px; font-weight: 800;
  letter-spacing: .06em; text-transform: uppercase; color: #94a3b8;
}

.pts-option {
  display: flex; align-items: flex-start; gap: 12px; width: 100%;
  margin-bottom: 6px; padding: 12px; border: 1.5px solid #eef2f7; border-radius: 12px;
  background: #fff; font-family: inherit; text-align: left; cursor: pointer;
  transition: border-color .12s ease, background .12s ease;
}
.pts-option:last-child { margin-bottom: 0; }
.pts-option:hover, .pts-option:focus-visible { outline: none; border-color: #cbd5e1; background: #f8fafc; }
.pts-option.selected { border-color: #facc15; background: #fffbeb; }

.pts-radio {
  width: 20px; height: 20px; flex-shrink: 0; margin-top: 1px;
  display: grid; place-items: center; border: 2px solid #cbd5e1; border-radius: 50%;
  background: #fff; color: transparent; transition: background .12s ease, border-color .12s ease;
}
.pts-option.selected .pts-radio { border-color: #eab308; background: #eab308; color: #0d1f3c; }
.pts-option-body { flex: 1; min-width: 0; }
.pts-option-none { font-size: 13.5px; font-weight: 700; color: #64748b; line-height: 20px; }

/* ---- Bar and rows (used in the list and in the selected box) ---- */
.pts-breakdown { display: flex; flex-direction: column; gap: 9px; }
.pts-bar { display: flex; gap: 3px; height: 6px; }
.pts-bar span { min-width: 6px; border-radius: 999px; }
.pts-rows { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.pts-row { display: flex; align-items: baseline; gap: 10px; }
.pts-pct {
  flex-shrink: 0; min-width: 46px; padding: 2px 8px; border-radius: 999px;
  border: 1.5px solid var(--seg, #0d1f3c); background: #fff; color: #0d1f3c;
  font-size: 12px; font-weight: 800; text-align: center; font-variant-numeric: tabular-nums;
}
.pts-label { font-size: 13.5px; font-weight: 600; line-height: 1.4; color: #1f2937; overflow-wrap: anywhere; }

/* ---- Box under the button after choosing ---- */
.pts-chosen {
  display: flex; align-items: flex-start; gap: 10px; margin-top: 10px;
  padding: 14px; border: 1px solid #fde68a; border-radius: 14px;
  background: linear-gradient(135deg, #fefce8 0%, #fff 100%);
}
.pts-chosen-body { flex: 1; min-width: 0; }
.pts-chosen-title {
  display: block; margin-bottom: 10px; font-size: 11px; font-weight: 800;
  letter-spacing: .06em; text-transform: uppercase; color: #b45309;
}
.pts-clear {
  width: 26px; height: 26px; flex-shrink: 0; display: grid; place-items: center;
  border: none; border-radius: 50%; background: #fde68a; color: #78350f; cursor: pointer;
}
.pts-clear:hover { background: #fcd34d; }

@media (prefers-reduced-motion: reduce) { .pts-menu { animation: none; } .pts-chevron { transition: none; } }
`;

export default function PaymentTermsSelect({ terms, value, onChange, id, disabled = false }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const selected = terms.find((t) => String(t.id) === String(value)) || null;

  // Close when clicking outside or pressing Esc
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(newValue) {
    onChange(newValue);
    setOpen(false);
  }

  // Arrow keys move between the options
  function onMenuKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll("button") || []);
    const index = items.indexOf(document.activeElement);
    const next = e.key === "ArrowDown" ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  }

  return (
    <div className="pts" ref={wrapRef}>
      <style>{CSS}</style>

      <button
        type="button"
        id={id}
        className={`pts-btn ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="pts-btn-icon">
          <CalendarClock size={16} />
        </span>
        <span className={`pts-btn-text ${selected ? "" : "placeholder"}`}>
          {selected ? selected.description : "Select payment terms..."}
        </span>
        <ChevronDown size={18} className="pts-chevron" />
      </button>

      {open && (
        <div className="pts-menu" role="listbox" ref={menuRef} onKeyDown={onMenuKeyDown}>
          <p className="pts-menu-title">Choose payment terms</p>

          <button
            type="button"
            role="option"
            aria-selected={!selected}
            className={`pts-option ${!selected ? "selected" : ""}`}
            onClick={() => pick("")}
          >
            <span className="pts-radio">
              <Check size={12} strokeWidth={3.5} />
            </span>
            <span className="pts-option-body">
              <span className="pts-option-none">No payment terms</span>
            </span>
          </button>

          {terms.map((pt) => {
            const isSelected = String(pt.id) === String(value);
            return (
              <button
                key={pt.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`pts-option ${isSelected ? "selected" : ""}`}
                onClick={() => pick(String(pt.id))}
              >
                <span className="pts-radio">
                  <Check size={12} strokeWidth={3.5} />
                </span>
                <span className="pts-option-body">
                  <TermsBreakdown description={pt.description} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && !open && (
        <div className="pts-chosen">
          <div className="pts-chosen-body">
            <span className="pts-chosen-title">Selected payment terms</span>
            <TermsBreakdown description={selected.description} />
          </div>
          <button type="button" className="pts-clear" onClick={() => onChange("")} aria-label="Remove payment terms">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}