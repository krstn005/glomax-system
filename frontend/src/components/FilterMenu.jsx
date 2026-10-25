import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, ChevronDown, Check, X } from 'lucide-react';
import '../styles/filter-menu.css';

/* ------------------------------------------------------------------
   Filter drop-down button, shared by every portal (not dashboards).

   Props:
     options   - list of choices:
                 { key, label, icon, tone, group? }
                 tone: 'navy' | 'gold' | 'blue' | 'green' | 'red' | 'gray'
                 group: optional small heading shown above that choice
     activeKey - the picked option's key
     counts    - { [key]: number } shown on the right of each choice
                 (leave a key out to show "—" while loading)
     onPick    - called with the key the user picked
     allKey    - the "show everything" option (default 'ALL').
                 When it's picked, the button just says "Filter".
     alertKey  - optional: shows a small gold dot on the button when
                 this option has items and isn't the picked one
                 (for things that need action)
     label     - text on the button when nothing is picked (default 'Filter')
     ariaLabel - what the list is for, read out by screen readers
------------------------------------------------------------------- */
export default function FilterMenu({
  options,
  activeKey,
  counts = {},
  onPick,
  allKey = 'ALL',
  alertKey,
  label = 'Filter',
  ariaLabel = 'Filter',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const current = options.find((o) => o.key === activeKey) || options[0];
  const CurrentIcon = current?.icon || SlidersHorizontal;
  const filtered = activeKey !== allKey;
  const alertCount = alertKey ? counts[alertKey] || 0 : 0;
  const showAlert = alertCount > 0 && activeKey !== alertKey;

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(key) {
    onPick(key);
    setOpen(false);
  }

  let lastGroup = null;

  return (
    <div className={`gx-filter ${filtered ? 'is-filtered' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className={`gx-filter-btn ${open ? 'open' : ''} ${filtered ? 'filtered' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={filtered ? `${ariaLabel}: ${current.label}` : ariaLabel}
      >
        {filtered ? <CurrentIcon size={16} /> : <SlidersHorizontal size={16} />}
        <span className="gx-filter-text">{filtered ? current.label : label}</span>
        {showAlert && <span className="gx-filter-alert" aria-hidden="true" />}
        <ChevronDown size={16} className="gx-filter-chevron" />
      </button>

      {filtered && (
        <button type="button" className="gx-filter-clear" onClick={() => onPick(allKey)} aria-label="Clear filter">
          <X size={14} />
        </button>
      )}

      {open && (
        <div className="gx-filter-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(({ key, group, label: itemLabel, icon: Icon, tone = 'navy' }) => {
            const selected = key === activeKey;
            const value = counts[key];
            const heading = group && group !== lastGroup ? group : null;
            lastGroup = group;
            return (
              <div key={key}>
                {heading && <p className="gx-filter-group">{heading}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`gx-filter-item tone-${tone} ${selected ? 'selected' : ''} ${
                    key === alertKey && alertCount > 0 ? 'flag' : ''
                  }`}
                  onClick={() => pick(key)}
                >
                  <span className="gx-filter-icon">{Icon && <Icon size={15} />}</span>
                  <span className="gx-filter-label">{itemLabel}</span>
                  <span className="gx-filter-count">{value !== undefined && value !== null ? value : '—'}</span>
                  <span className="gx-filter-check">{selected && <Check size={15} />}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}