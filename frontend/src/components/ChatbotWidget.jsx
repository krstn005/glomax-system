import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle, Bot, X, Send } from 'lucide-react';
import { askChatbot } from '../api/chatbot';
import './chatbot-widget.css';

// The chat box only shows on the public pages
const SHOW_ON = ['/', '/faqs', '/login', '/register'];

const SUGGESTIONS = [
  'How do I request a roof assessment?',
  'What packages do you offer?',
  'How much does it cost?',
  'On-Grid or Hybrid?',
];

const WELCOME = {
  from: 'bot',
  text: "Hi! I'm the Glomax Assistant. Ask me about roof assessments, packages, prices or your request.",
};

export default function ChatbotWidget() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open, busy]);

  if (!SHOW_ON.includes(pathname)) return null;

  async function send(question) {
    const q = String(question || '').trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { from: 'me', text: q }]);
    setText('');
    setBusy(true);
    try {
      const data = await askChatbot(q);
      if (data.answered) {
        setMessages((m) => [...m, { from: 'bot', answers: data.answers }]);
      } else {
        setMessages((m) => [...m, { from: 'bot', notFound: true }]);
      }
    } catch (err) {
      const tooMany = err?.response?.status === 429;
      setMessages((m) => [
        ...m,
        {
          from: 'bot',
          text: tooMany
            ? 'You have asked a lot of questions. Please try again a little later, or send us an inquiry.'
            : "I can't reach the server right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    send(text);
  }

  if (!open) {
    return (
      <button type="button" className="cbw-fab" onClick={() => setOpen(true)} aria-label="Open the chat assistant">
        <MessageCircle size={18} />
        Ask us
      </button>
    );
  }

  return (
    <div className="cbw-panel" role="dialog" aria-label="Glomax Assistant">
      <div className="cbw-head">
        <span className="cbw-head-icon">
          <Bot size={19} />
        </span>
        <div className="cbw-head-text">
          <strong>Glomax Assistant</strong>
          <span>Quick answers to common questions</span>
        </div>
        <button type="button" className="cbw-close" onClick={() => setOpen(false)} aria-label="Close chat">
          <X size={18} />
        </button>
      </div>

      <div className="cbw-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i} className={`cbw-msg ${m.from === 'me' ? 'me' : 'bot'}`}>
            {m.answers &&
              m.answers.map((a) => (
                <div className="cbw-answer" key={a.question}>
                  <strong>{a.question}</strong>
                  {a.answer}
                </div>
              ))}
            {m.notFound && (
              <>
                I don't have an answer for that yet. Please send us an inquiry using the contact form on our{' '}
                <Link to="/" className="cbw-link" onClick={() => setOpen(false)}>
                  home page
                </Link>
                , and our team will reply by email.
              </>
            )}
            {m.text}
          </div>
        ))}
        {messages.length === 1 && (
          <div className="cbw-chips">
            {SUGGESTIONS.map((s) => (
              <button type="button" key={s} className="cbw-chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {busy && <div className="cbw-msg bot">Typing...</div>}
      </div>

      <form className="cbw-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your question"
          maxLength={300}
          aria-label="Type your question"
        />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send">
          <Send size={17} />
        </button>
      </form>
      <p className="cbw-note">Automatic answers. Our team can help with anything else.</p>
    </div>
  );
}