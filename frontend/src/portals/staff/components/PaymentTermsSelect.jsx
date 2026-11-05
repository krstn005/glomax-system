import { useEffect, useRef, useState } from "react";
import { CalendarClock, ChevronDown, Check, X } from "lucide-react";

// A payment term can be long, like
// "30% Upon Downpayment, 20% Upon Mobilization, 45% Upon Completion".
// This puts each part on its own line so it is easy to read.
function splitTerms(text) {
  return String(text || "")
    .split(/,\s*(?=\d)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

const CSS = `
.pts { position: relative; }
.pts-btn {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px;
  padding: 0 12px 0 13px; border: 1.5px solid #e2e8f0; border-radius: 11px;
  background: #f8fafc; font-family: inherit; font-size: 14px; color: #0f172a;
  text-align: left; cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.pts-btn:hover { border-color: #cbd5e1; }
.pts-btn.open, .pts-btn:focus-visible {
  outline: none; border-color: #facc15; background: #fff;
  box-shadow: 0 0 0 4px rgba(250, 204, 21, 0.18);
}
.pts-btn > svg { flex-shrink: 0; color: #94a3b8; }
.pts-btn-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pts-btn-text.placeholder { color: #94a3b8; }
.pts-chevron { transition: transform .2s ease; }
.pts-btn.open .pts-chevron { transform: rotate(180deg); }

.pts-menu {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 60;
  max-height: 320px; overflow-y: auto; padding: 6px;
  border: 1px solid #eef2f7; border-radius: 14px; background: #fff;
  box-shadow: 0 18px 40px rgba(13, 31, 60, 0.18);
  animation: ptsPop .15s ease-out;
}
@keyframes ptsPop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

.pts-option {
  display: flex; align-items: flex-start; gap: 10px; width: 100%;
  padding: 10px 10px; border: none; border-radius: 10px; background: transparent;
  font-family: inherit; text-align: left; cursor: pointer;
  transition: background .12s ease;
}
.pts-option:hover, .pts-option:focus-visible { outline: none; background: #f5f7fb; }
.pts-option.selected { background: #fffbeb; }
.pts-option-lines { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pts-option-line { font-size: 13.5px; font-weight: 600; line-height: 1.4; color: #111827; overflow-wrap: anywhere; }
.pts-option-none { font-size: 13.5px; font-weight: 600; color: #64748b; }
.pts-check { width: 18px; flex-shrink: 0; display: flex; justify-content: center; padding-top: 2px; color: #ca8a04; }

.pts-chosen {
  display: flex; align-items: flex-start; gap: 10px; margin-top: 8px;
  padding: 11px 12px; border: 1px solid #fde68a; border-radius: 11px; background: #fefce8;
}
.pts-chosen-body { flex: 1; min-width: 0; }
.pts-chosen-title {
  display: block; margin-bottom: 4px; font-size: 11px; font-weight: 800;
  letter-spacing: .05em; text-transform: uppercase; color: #b45309;
}
.pts-chosen-line { display: block; font-size: 13.5px; line-height: 1.5; color: #78350f; overflow-wrap: anywhere; }
.pts-clear {
  width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center;
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
        <CalendarClock size={16} />
        <span className={`pts-btn-text ${selected ? "" : "placeholder"}`}>
          {selected ? selected.description : "Select payment terms..."}
        </span>
        <ChevronDown size={16} className="pts-chevron" />
      </button>

      {open && (
        <div className="pts-menu" role="listbox" ref={menuRef} onKeyDown={onMenuKeyDown}>
          <button
            type="button"
            role="option"
            aria-selected={!selected}
            className={`pts-option ${!selected ? "selected" : ""}`}
            onClick={() => pick("")}
          >
            <span className="pts-option-lines">
              <span className="pts-option-none">No payment terms</span>
            </span>
            <span className="pts-check">{!selected && <Check size={15} />}</span>
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
                <span className="pts-option-lines">
                  {splitTerms(pt.description).map((line, i) => (
                    <span key={i} className="pts-option-line">{line}</span>
                  ))}
                </span>
                <span className="pts-check">{isSelected && <Check size={15} />}</span>
              </button>
            );
          })}
        </div>
      )}

      {selected && !open && (
        <div className="pts-chosen">
          <div className="pts-chosen-body">
            <span className="pts-chosen-title">Selected payment terms</span>
            {splitTerms(selected.description).map((line, i) => (
              <span key={i} className="pts-chosen-line">{line}</span>
            ))}
          </div>
          <button type="button" className="pts-clear" onClick={() => onChange("")} aria-label="Remove payment terms">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}