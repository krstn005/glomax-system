import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Bot, Send } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { getFaqs, createFaq, updateFaq, deleteFaq, loadDefaultFaqs } from '../../../api/chatbot';
import { askChatbot } from '../../../api/chatbot';
import '../styles/admin-chatbot.css';

const EMPTY = { question: '', keywords: '', answer: '', is_active: true, sort_order: 100 };

function errorText(err, fallback) {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return fallback;
  if (data.detail) return data.detail;
  const key = Object.keys(data)[0];
  if (key) {
    const value = Array.isArray(data[key]) ? data[key][0] : data[key];
    return `${key.replace(/_/g, ' ')}: ${value}`;
  }
  return fallback;
}

export default function AdminChatbotPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // null = closed, otherwise the FAQ being added or edited
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'err', text }
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);

  async function load() {
    try {
      setFaqs(await getFaqs());
    } catch {
      setMessage({ type: 'err', text: 'Could not load the FAQ list. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        question: form.question,
        keywords: form.keywords,
        answer: form.answer,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 100,
      };
      if (form.id) await updateFaq(form.id, payload);
      else await createFaq(payload);
      setForm(null);
      setMessage({ type: 'ok', text: 'FAQ saved.' });
      await load();
    } catch (err) {
      setMessage({ type: 'err', text: errorText(err, 'Could not save this FAQ.') });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(faq) {
    try {
      await updateFaq(faq.id, { is_active: !faq.is_active });
      await load();
    } catch (err) {
      setMessage({ type: 'err', text: errorText(err, 'Could not change this FAQ.') });
    }
  }

  async function handleDelete(id) {
    try {
      await deleteFaq(id);
      setConfirmId(null);
      setMessage({ type: 'ok', text: 'FAQ deleted.' });
      await load();
    } catch (err) {
      setMessage({ type: 'err', text: errorText(err, 'Could not delete this FAQ.') });
    }
  }

  async function handleDefaults() {
    setMessage(null);
    try {
      const data = await loadDefaultFaqs();
      setMessage({ type: 'ok', text: data.detail });
      await load();
    } catch (err) {
      setMessage({ type: 'err', text: errorText(err, 'Could not add the suggested FAQs.') });
    }
  }

  async function handleTest(e) {
    e.preventDefault();
    if (!testText.trim()) return;
    try {
      setTestResult(await askChatbot(testText.trim()));
    } catch {
      setTestResult({ error: true });
    }
  }

  const keywordList = (text) =>
    String(text || '')
      .split(/[,\n]+/)
      .map((k) => k.trim())
      .filter(Boolean);

  return (
    <AdminLayout
      pageTitle="Chatbot FAQs"
      pageSubtitle="The questions and answers the automatic reply and the website chat box use"
    >
      <div className="acb-page">
        {message && <div className={`acb-msg ${message.type}`}>{message.text}</div>}

        <section className="acb-card">
          <h2>Try the chatbot</h2>
          <p className="acb-sub">Type a customer's message to see which FAQ would answer it.</p>
          <form className="acb-row" onSubmit={handleTest}>
            <input
              className="acb-field-input"
              style={{ flex: '1 1 240px', padding: '9px 11px', border: '1px solid #d1d5db', borderRadius: 10, font: 'inherit', fontSize: 14 }}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="e.g. How much is a 6kW package?"
              maxLength={300}
            />
            <button type="submit" className="acb-btn primary">
              <Send size={15} />
              Test
            </button>
          </form>
          {testResult && (
            <div className="acb-test-result">
              {testResult.error && <div>Could not test right now.</div>}
              {!testResult.error && !testResult.answered && (
                <div>No FAQ matched. The customer would wait for a Staff reply.</div>
              )}
              {testResult.answers?.map((a) => (
                <div key={a.question}>
                  <strong>{a.question}</strong>
                  <br />
                  {a.answer}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="acb-card">
          <div className="acb-row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2>FAQ list</h2>
              <p className="acb-sub" style={{ margin: 0 }}>
                {faqs.length} question{faqs.length === 1 ? '' : 's'}. The chatbot only repeats what is written here.
              </p>
            </div>
            <button type="button" className="acb-btn primary" onClick={() => setForm({ ...EMPTY })}>
              <Plus size={15} />
              Add FAQ
            </button>
          </div>

          {form && (
            <form onSubmit={handleSave} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e5e7eb' }}>
              <div className="acb-field">
                <label htmlFor="faq-q">Question</label>
                <input
                  id="faq-q"
                  value={form.question}
                  onChange={(e) => setForm({ ...form, question: e.target.value })}
                  maxLength={200}
                  required
                />
              </div>
              <div className="acb-field">
                <label htmlFor="faq-k">Keywords</label>
                <textarea
                  id="faq-k"
                  rows={2}
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  required
                />
                <small>
                  Separate with commas. A phrase like "roof assessment" counts double. A message needs at least 2
                  points to get this answer.
                </small>
              </div>
              <div className="acb-field">
                <label htmlFor="faq-a">Answer</label>
                <textarea
                  id="faq-a"
                  rows={4}
                  value={form.answer}
                  onChange={(e) => setForm({ ...form, answer: e.target.value })}
                  required
                />
              </div>
              <div className="acb-row">
                <button type="submit" className="acb-btn primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save FAQ'}
                </button>
                <button type="button" className="acb-btn" onClick={() => setForm(null)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!loading && faqs.length === 0 && !form && (
            <div style={{ marginTop: 14 }}>
              <p className="acb-sub">No FAQs yet. You can start with a set of suggested ones and edit them.</p>
              <button type="button" className="acb-btn primary" onClick={handleDefaults}>
                <Bot size={15} />
                Add suggested FAQs
              </button>
            </div>
          )}

          <div className="acb-list" style={{ marginTop: 14 }}>
            {faqs.map((faq) => (
              <div key={faq.id} className={`acb-item ${faq.is_active ? '' : 'off'}`}>
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
                <div className="acb-keys">
                  {keywordList(faq.keywords).map((k) => (
                    <span className="acb-key" key={k}>
                      {k}
                    </span>
                  ))}
                </div>
                <div className="acb-row">
                  <button type="button" className="acb-btn" onClick={() => setForm({ ...faq })}>
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button type="button" className="acb-btn" onClick={() => toggleActive(faq)}>
                    {faq.is_active ? 'Turn off' : 'Turn on'}
                  </button>
                  {confirmId === faq.id ? (
                    <>
                      <button type="button" className="acb-btn danger" onClick={() => handleDelete(faq.id)}>
                        Yes, delete
                      </button>
                      <button type="button" className="acb-btn" onClick={() => setConfirmId(null)}>
                        No
                      </button>
                    </>
                  ) : (
                    <button type="button" className="acb-btn danger" onClick={() => setConfirmId(faq.id)}>
                      <Trash2 size={14} />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}