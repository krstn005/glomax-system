import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronDown,
  Search,
  X,
  HelpCircle,
  AlertCircle,
  SearchX,
  MessageCircleQuestion,
  Activity,
  Star,
  ChevronsUpDown,
} from 'lucide-react';
import { getPublicFaqs } from '../../../api/adminconfig';
import CustomerLayout from '../components/CustomerLayout';
import '../styles/faq.css';

function FaqSkeleton() {
  return (
    <div className="faq-layout">
      <div className="faq-main">
        <div className="faq-list">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="faq-item faq-item-skeleton">
              <span className="faq-skel faq-skel-num" />
              <span className="faq-skel faq-skel-line" />
            </div>
          ))}
        </div>
      </div>
      <aside className="faq-side">
        <span className="faq-skel faq-skel-card" />
      </aside>
    </div>
  );
}

// Side panel shown next to the questions (and under them on phones)
function HelpSidebar() {
  return (
    <aside className="faq-side">
      <div className="faq-help-card">
        <div className="faq-help-glow" aria-hidden="true" />
        <span className="faq-help-icon">
          <MessageCircleQuestion size={22} />
        </span>
        <p className="faq-help-title">Still have questions?</p>
        <p className="faq-help-text">
          Check the latest progress of your request, or send us a message through the Feedback page. Our team is happy
          to help.
        </p>
        <div className="faq-help-actions">
          <Link to="/request-status" className="faq-help-btn-gold">
            <Activity size={15} />
            Request Status
          </Link>
          <Link to="/feedback" className="faq-help-btn-outline">
            <Star size={15} />
            Send Feedback
          </Link>
        </div>
      </div>
    </aside>
  );
}

export default function FaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openIds, setOpenIds] = useState([]);
  const [searchText, setSearchText] = useState('');

  async function load() {
    try {
      setLoading(true);
      const data = await getPublicFaqs();
      setFaqs(data);
      setError('');
    } catch {
      setError('Could not load FAQs. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const search = searchText.trim().toLowerCase();
  const filteredFaqs = faqs.filter(
    (f) => search === '' || f.question?.toLowerCase().includes(search) || f.answer?.toLowerCase().includes(search)
  );

  const allOpen = filteredFaqs.length > 0 && filteredFaqs.every((f) => openIds.includes(f.id));
  const canSearch = !loading && !error && faqs.length > 0;

  function toggle(id) {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleAll() {
    setOpenIds(allOpen ? [] : filteredFaqs.map((f) => f.id));
  }

  return (
    <CustomerLayout
      pageTitle="Frequently Asked Questions"
      pageSubtitle="Answers to common questions about our solar installation process"
    >
      <div className="faq-page">
        {/* ---------- Banner with search ---------- */}
        <section className="faq-hero">
          <div className="faq-hero-glow" aria-hidden="true" />
          <div className="faq-hero-top">
            <div className="faq-hero-icon">
              <HelpCircle size={26} />
            </div>
            <div className="faq-hero-text">
              <h1>How can we help?</h1>
              <p>Quick answers about requests, site visits, payments and installation.</p>
            </div>
          </div>

          {canSearch && (
            <div className="faq-search">
              <Search size={18} className="faq-search-icon" />
              <input
                type="text"
                placeholder="Search questions"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-label="Search questions"
              />
              {searchText && (
                <button
                  type="button"
                  className="faq-search-clear"
                  onClick={() => setSearchText('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </section>

        {loading && <FaqSkeleton />}

        {!loading && error && (
          <div className="faq-panel">
            <div className="faq-empty">
              <span className="faq-empty-badge red">
                <AlertCircle size={26} />
              </span>
              <p className="faq-empty-title">Something went wrong</p>
              <p className="faq-empty-hint">{error}</p>
              <button type="button" className="faq-btn-primary" onClick={load}>
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && faqs.length === 0 && (
          <div className="faq-layout">
            <div className="faq-main">
              <div className="faq-panel">
                <div className="faq-empty">
                  <span className="faq-empty-badge">
                    <HelpCircle size={26} />
                  </span>
                  <p className="faq-empty-title">No FAQs yet</p>
                  <p className="faq-empty-hint">
                    Our team hasn't added any questions here yet. In the meantime, you can check your request's
                    progress or send us a message through Feedback.
                  </p>
                  <div className="faq-empty-actions">
                    <Link to="/request-status" className="faq-btn-primary">
                      View Request Status
                    </Link>
                    <Link to="/feedback" className="faq-btn-secondary">
                      Send Feedback
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <HelpSidebar />
          </div>
        )}

        {!loading && !error && faqs.length > 0 && (
          <div className="faq-layout">
            <div className="faq-main">
              {filteredFaqs.length > 1 && (
                <div className="faq-list-head">
                  <button type="button" className="faq-toggle-all" onClick={toggleAll}>
                    <ChevronsUpDown size={15} />
                    {allOpen ? 'Collapse all' : 'Expand all'}
                  </button>
                </div>
              )}

              {filteredFaqs.length === 0 ? (
                <div className="faq-panel">
                  <div className="faq-empty small">
                    <span className="faq-empty-badge">
                      <SearchX size={26} />
                    </span>
                    <p className="faq-empty-title">No matching questions</p>
                    <p className="faq-empty-hint">Try different words, or clear the search to see everything.</p>
                    <button type="button" className="faq-btn-secondary" onClick={() => setSearchText('')}>
                      Clear search
                    </button>
                  </div>
                </div>
              ) : (
                <div className="faq-list">
                  {filteredFaqs.map((f, index) => {
                    const isOpen = openIds.includes(f.id);
                    return (
                      <div className={`faq-item ${isOpen ? 'open' : ''}`} key={f.id}>
                        <button
                          type="button"
                          className="faq-question"
                          onClick={() => toggle(f.id)}
                          aria-expanded={isOpen}
                        >
                          <span className="faq-num">{String(index + 1).padStart(2, '0')}</span>
                          <span className="faq-question-text">{f.question}</span>
                          <span className="faq-chevron-wrap">
                            <ChevronDown size={18} className="faq-chevron" />
                          </span>
                        </button>
                        <div className="faq-answer-wrap">
                          <div className="faq-answer-inner">
                            <p className="faq-answer">{f.answer}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <HelpSidebar />
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}