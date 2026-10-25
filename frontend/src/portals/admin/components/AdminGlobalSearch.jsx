import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getAdminTickets } from '../../../api/adminTickets';
import '../styles/admin-global-search.css';

export default function AdminGlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [tickets, setTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Loads the full ticket list once, lazily, the first time the
  // person actually types something - avoids an extra API call on
  // every single page load just for a search bar that may never be used.
  async function ensureLoaded() {
    if (loaded) return;
    try {
      const data = await getAdminTickets();
      setTickets(data);
      setLoaded(true);
    } catch {
      // Silent failure is acceptable here - search staying empty
      // is a minor inconvenience, not worth a page-level error banner
      // for a header widget.
    }
  }

  function handleChange(e) {
    const value = e.target.value;
    setTerm(value);
    setOpen(value.trim().length > 0);
    if (value.trim().length > 0) {
      ensureLoaded();
    }
  }

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const query = term.trim().toLowerCase();
  const results = query
    ? tickets
        .filter(
          (t) =>
            t.ticket_number.toLowerCase().includes(query) ||
            t.customer_username.toLowerCase().includes(query) ||
            (t.property_address || '').toLowerCase().includes(query)
        )
        .slice(0, 8)
    : [];

  function goToTicket(id) {
    navigate(`/admin/requests/${id}`);
    setTerm('');
    setOpen(false);
  }

  return (
    <div className="adm-gsearch" ref={wrapRef}>
      <div className="adm-gsearch-input-wrap">
        <Search size={14} />
        <input
          type="text"
          placeholder="Search tickets..."
          value={term}
          onChange={handleChange}
          onFocus={() => term.trim() && setOpen(true)}
        />
      </div>

      {open && (
        <div className="adm-gsearch-dropdown">
          {results.length === 0 ? (
            <p className="adm-gsearch-empty">No matching tickets.</p>
          ) : (
            results.map((t) => (
              <button key={t.id} className="adm-gsearch-result" onClick={() => goToTicket(t.id)}>
                <div className="adm-gsearch-result-ref">{t.ticket_number}</div>
                <div className="adm-gsearch-result-sub">
                  {t.customer_username} {t.property_address ? `· ${t.property_address}` : ''}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}