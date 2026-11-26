import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Bot,
  X,
  Send,
  Calculator,
  ClipboardList,
  Package,
  Wallet,
  Zap,
  Activity,
  HelpCircle,
  MessageCircleQuestion,
  ChevronRight,
} from 'lucide-react';
import { askChatbot } from '../api/chatbot';
import { getPublicFaqs } from '../api/adminconfig';
import './chatbot-widget.css';

// The chat box only shows on the public pages
const SHOW_ON = ['/', '/faqs'];

// ---------- Package finder ----------
// All numbers come from the Glomax package quotation (the client's own table).
// The roof assessment confirms the real package for each home.
const PACKAGES = {
  3: {
    kwp: 3.48, panels: 6, roofSqm: 20, inverter: '3 kW',
    savingsOnGrid: [2500, 3000], savingsHybrid: 3000, years: { ON_GRID: '5', HYBRID: '6' },
    price: { ON_GRID: 106000, HYBRID: 215000 },
    pay: { ON_GRID: [31800, 21200, 47700, 5300], HYBRID: [64500, 43000, 96750, 10750] },
  },
  6: {
    kwp: 5.8, panels: 10, roofSqm: 30, inverter: '6 kW',
    savingsOnGrid: [4000, 4500], savingsHybrid: 4500, years: { ON_GRID: '4', HYBRID: '5' },
    price: { ON_GRID: 155000, HYBRID: 260000 },
    pay: { ON_GRID: [46500, 31000, 69750, 7750], HYBRID: [78000, 52000, 117000, 13000] },
  },
  8: {
    kwp: 8.12, panels: 14, roofSqm: 42, inverter: '8 kW',
    savingsOnGrid: [6000, 6500], savingsHybrid: 6500, years: { ON_GRID: '4', HYBRID: '5' },
    price: { ON_GRID: 205000, HYBRID: 335000 },
    pay: { ON_GRID: [61500, 41000, 92250, 10250], HYBRID: [100500, 67000, 150750, 16750] },
  },
  10: {
    kwp: 10.44, panels: 18, roofSqm: 55, inverter: '10 kW',
    savingsOnGrid: [7500, 8000], savingsHybrid: 8000, years: { ON_GRID: '3.5', HYBRID: '4' },
    price: { ON_GRID: 245000, HYBRID: 375000 },
    pay: { ON_GRID: [73500, 49000, 110250, 12250], HYBRID: [112500, 75000, 168750, 18750] },
  },
};
const PACKAGE_SIZES = Object.keys(PACKAGES).map(Number); // 3, 6, 8, 10
const LOW_BILL = PACKAGES[3].savingsOnGrid[0]; // under this, even the 3 kW package is more than needed

// Picks the biggest package whose savings do not go over the bill
function findPackage(bill) {
  let kw = PACKAGE_SIZES[0];
  PACKAGE_SIZES.forEach((size) => {
    if (bill >= PACKAGES[size].savingsOnGrid[0]) kw = size;
  });
  const biggest = PACKAGE_SIZES[PACKAGE_SIZES.length - 1];
  return { kw, tooBig: bill > PACKAGES[biggest].savingsOnGrid[1] + 1000, spec: PACKAGES[kw] };
}

const peso = (n) => `₱${Math.round(n).toLocaleString('en-PH')}`;

// Reads an electric bill from what the visitor typed: "5000", "P5,000", "5k",
// "my bill is 5000", "5000 pesos". Returns null if it does not look like a bill.
function billFromText(text) {
  const t = String(text || '').trim().toLowerCase();
  const plain = t.match(/^(?:₱|php|p)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:pesos?|piso|php)?$/);
  if (plain) {
    const n = Number(plain[1].replace(/,/g, '')) * (plain[2] ? 1000 : 1);
    return Number.isFinite(n) ? n : null;
  }
  if (/\b(bill|kuryente|singil|meralco)\b/.test(t)) {
    const m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(k)?/);
    if (m) {
      const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

// ---------- Matching typed questions with the FAQ list ----------
const STOP = new Set(
  'a an the is are was do does did i my me to of for in on and or can how what we you your it be with at by this that there'.split(' ')
);

// Common Tagalog / Taglish words, turned into the English words the FAQs use
const TAGALOG = {
  magkano: 'price cost',
  presyo: 'price cost',
  halaga: 'price cost',
  gastos: 'price cost',
  bayad: 'payment pay',
  hulog: 'payment installment',
  hulugan: 'payment installment',
  paano: 'how',
  pano: 'how',
  kuryente: 'electric bill',
  singil: 'bill',
  bubong: 'roof',
  bahay: 'house roof',
  tagal: 'long days time',
  katagal: 'long days time',
  araw: 'days',
  kailan: 'when',
  saan: 'where',
  nasaan: 'where status',
  tulong: 'help',
  tawag: 'contact call',
  numero: 'number contact',
  baterya: 'battery hybrid',
  brownout: 'battery hybrid outage',
  tipid: 'savings save',
  ipon: 'savings save',
  apply: 'request',
  magrequest: 'request',
  mag: '',
  kasi: '',
  ang: '',
  ng: '',
  sa: '',
  ba: '',
  po: '',
};

function tokens(text) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const out = new Set();
  raw.forEach((word) => {
    const parts = TAGALOG[word] !== undefined ? TAGALOG[word].split(' ') : [word];
    parts.forEach((p) => {
      if (!p || STOP.has(p)) return;
      out.add(p);
      if (p.length > 3 && p.endsWith('s')) out.add(p.slice(0, -1));
    });
  });
  return out;
}

// Ranks the FAQ list for what the visitor typed. Best first.
function rankFaqs(text, faqs) {
  const user = tokens(text);
  if (!user.size) return [];
  return faqs
    .map((faq) => {
      const q = tokens(faq.question);
      const a = tokens(faq.answer);
      let score = 0;
      user.forEach((w) => {
        if (q.has(w)) score += 2;
        else if (a.has(w)) score += 1;
      });
      return { faq, score };
    })
    .filter((row) => row.score >= 2)
    .sort((x, y) => y.score - x.score);
}

// ---------- Cards ----------
function PackageCard({ card }) {
  const { kw, spec, bill, tooBig } = card;
  const range = `${peso(spec.savingsOnGrid[0])} - ${peso(spec.savingsOnGrid[1])}`;
  return (
    <div className="cbw-pack">
      <div className="cbw-pack-top">
        <span className="cbw-pack-kw">
          {kw}
          <small>kW</small>
        </span>
        <span className="cbw-pack-top-text">
          <strong>Best fit for you</strong>
          <span>Monthly bill: {peso(bill)}</span>
        </span>
      </div>

      <div className="cbw-pack-specs">
        <div>
          <span>Panels</span>
          <strong>{spec.panels} pcs</strong>
          <small>580 W each</small>
        </div>
        <div>
          <span>Capacity</span>
          <strong>{spec.kwp} kWp</strong>
          <small>Inverter {spec.inverter}</small>
        </div>
        <div>
          <span>Roof space</span>
          <strong>{spec.roofSqm} sq.m</strong>
          <small>about</small>
        </div>
      </div>

      {tooBig && (
        <p className="cbw-pack-warn">Your bill is bigger than what our largest package covers, so this would cover part of it.</p>
      )}

      <div className="cbw-pack-types">
        <div className="cbw-pack-type">
          <span className="cbw-pack-type-name">On-Grid</span>
          <strong className="cbw-pack-price">{peso(spec.price.ON_GRID)}</strong>
          <span>Saves {range} a month</span>
          <span>Pays back in about {spec.years.ON_GRID} years</span>
        </div>
        <div className="cbw-pack-type">
          <span className="cbw-pack-type-name">Hybrid</span>
          <strong className="cbw-pack-price">{peso(spec.price.HYBRID)}</strong>
          <span>Saves {peso(spec.savingsHybrid)} a month</span>
          <span>Pays back in about {spec.years.HYBRID} years</span>
          <span className="cbw-pack-battery">With 100AH battery</span>
        </div>
      </div>

      <p className="cbw-pack-note">
        Estimates from our package quotation. The roof assessment confirms the right package for your roof.
      </p>
    </div>
  );
}

const PAY_STEPS = [
  { percent: '30%', label: 'Down payment' },
  { percent: '20%', label: 'Upon mobilization' },
  { percent: '45%', label: 'Upon completion' },
  { percent: '5%', label: 'Testing and commissioning' },
];

function PaymentCard({ card }) {
  const sp = card.kw ? PACKAGES[card.kw] : null;
  return (
    <div className="cbw-pay">
      <div className="cbw-pay-head">
        <strong>Payment schedule</strong>
        {sp && <span>{card.kw} kW package</span>}
      </div>
      <ol className="cbw-pay-list">
        {PAY_STEPS.map((step, i) => (
          <li key={step.label}>
            <span className="cbw-pay-dot">{step.percent}</span>
            <span className="cbw-pay-label">{step.label}</span>
            {sp && (
              <span className="cbw-pay-amounts">
                <b>{peso(sp.pay.ON_GRID[i])}</b>
                <i>{peso(sp.pay.HYBRID[i])}</i>
              </span>
            )}
          </li>
        ))}
      </ol>
      {sp ? (
        <p className="cbw-pay-note">
          <b>Bold</b> is On-Grid. <i>Italic</i> is Hybrid.
        </p>
      ) : (
        <p className="cbw-pay-note">The exact amounts depend on your package. Tap Find my package to see them.</p>
      )}
    </div>
  );
}

function PackagesCard() {
  return (
    <div className="cbw-pay">
      <div className="cbw-pay-head">
        <strong>Our packages</strong>
        <span>Cash price</span>
      </div>
      <ol className="cbw-pay-list">
        {PACKAGE_SIZES.map((kw) => {
          const sp = PACKAGES[kw];
          return (
            <li key={kw}>
              <span className="cbw-pay-dot">{kw} kW</span>
              <span className="cbw-pay-label">
                {sp.panels} panels
                <small>{sp.kwp} kWp</small>
              </span>
              <span className="cbw-pay-amounts">
                <b>{peso(sp.price.ON_GRID)}</b>
                <i>{peso(sp.price.HYBRID)}</i>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="cbw-pay-note">
        <b>Bold</b> is On-Grid. <i>Italic</i> is Hybrid.
      </p>
    </div>
  );
}

function MessageCard({ card }) {
  if (card.kind === 'package') return <PackageCard card={card} />;
  if (card.kind === 'payment') return <PaymentCard card={card} />;
  if (card.kind === 'packages') return <PackagesCard />;
  return null;
}

// ---------- Messages ----------
const LINKS = {
  team: { type: 'team', label: 'Talk to our team' },
  status: { type: 'link', to: '/request-status', label: 'Check my request' },
  request: { type: 'link', to: '/new-request', label: 'Send a request' },
};

const MENU = [
  { type: 'package', label: 'Find my package' },
  { type: 'ask', text: 'How do I request a roof assessment?', label: 'How do I request?' },
  { type: 'packages', label: 'Packages and prices' },
  { type: 'payment', label: 'Payment terms' },
  { type: 'ask', text: 'What is the difference between On-Grid and Hybrid?', label: 'On-Grid or Hybrid?' },
  { type: 'browse', label: 'All questions' },
  LINKS.status,
  LINKS.team,
];

// Small icon for each menu card
const MENU_ICONS = {
  'Find my package': Calculator,
  'How do I request?': ClipboardList,
  'Packages and prices': Package,
  'Payment terms': Wallet,
  'On-Grid or Hybrid?': Zap,
  'All questions': HelpCircle,
  'Check my request': Activity,
  'Talk to our team': MessageCircleQuestion,
};

const WELCOME = {
  from: 'bot',
  text: "Hi! I'm the Glomax Assistant. Tap a choice below, or type your question.",
  buttons: MENU,
};

const AFTER_ANSWER = [{ type: 'menu', label: 'Back to menu' }, LINKS.team];

export default function ChatbotWidget() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [messages, setMessages] = useState([WELCOME]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('chat'); // 'chat' or 'bill' (waiting for the monthly bill)
  const [faqs, setFaqs] = useState([]);
  const bodyRef = useRef(null);
  const loadedFaqs = useRef(false);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open, busy]);

  // Same list the FAQs page uses. Loaded once, the first time the chat opens.
  useEffect(() => {
    if (!open || loadedFaqs.current) return;
    loadedFaqs.current = true;
    getPublicFaqs()
      .then((data) => setFaqs(Array.isArray(data) ? data : []))
      .catch(() => setFaqs([]));
  }, [open]);

  if (!SHOW_ON.includes(pathname)) return null;

  // Takes the customer to the "Send Us an Inquiry" form on the home page
  const scrollToContact = (tries = 0) => {
    const el = document.getElementById('contact');
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top, behavior: 'smooth' });
    } else if (tries < 25) {
      setTimeout(() => scrollToContact(tries + 1), 120);
    }
  };

  const goToTeam = () => {
    closeChat();
    if (pathname !== '/') navigate('/');
    setTimeout(() => scrollToContact(), pathname === '/' ? 250 : 400);
  };

  // Slides the window back down to the button, then closes it
  const closeChat = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 220);
  };

  const say = (message) => setMessages((m) => [...m, message]);
  const botSay = (message) => say({ from: 'bot', ...message });

  function showMenu() {
    setMode('chat');
    botSay({ text: 'What would you like to know?', buttons: MENU });
  }

  function startPackageFinder() {
    setMode('bill');
    botSay({
      text: 'What is your monthly electric bill? Type the amount in pesos, for example 5000.',
      buttons: [{ type: 'menu', label: 'Cancel' }],
    });
  }

  function handleBill(value) {
    const parsed = typeof value === 'number' ? value : billFromText(value);
    const bill = parsed || 0;
    if (!bill || bill < 500 || bill > 500000) {
      botSay({
        text: 'That does not look like a monthly bill. Please type the amount in pesos, between 500 and 500,000. For example: 5000.',
        buttons: [{ type: 'menu', label: 'Cancel' }],
      });
      return;
    }
    const r = findPackage(bill);

    // A very low bill: even the smallest package is more than needed
    if (bill < LOW_BILL) {
      setMode('chat');
      botSay({
        text: [
          `A ${peso(bill)} monthly bill is quite low. Our smallest package is 3 kW, which saves about ${peso(PACKAGES[3].savingsOnGrid[0])} to ${peso(PACKAGES[3].savingsOnGrid[1])} a month, so it may be more than you need.`,
          'Our team can check if solar is worth it for your home.',
        ].join('\n\n'),
        buttons: [LINKS.team, { type: 'menu', label: 'Back to menu' }],
      });
      return;
    }

    setMode('chat');
    botSay({
      text: `For a ${peso(bill)} monthly bill, the ${r.kw} kW package fits best. Here are the details:`,
      card: { kind: 'package', kw: r.kw, spec: r.spec, bill, tooBig: r.tooBig },
      buttons: [
        { type: 'payment', kw: r.kw, label: 'Payment schedule' },
        LINKS.request,
        { type: 'menu', label: 'Back to menu' },
      ],
    });
  }

  // Looks in the FAQ list when the server bot has no answer
  function answerFromList(question) {
    const ranked = rankFaqs(question, faqs);
    if (ranked.length && ranked[0].score >= 4 && (ranked.length === 1 || ranked[0].score >= ranked[1].score * 1.5)) {
      const { faq } = ranked[0];
      botSay({ answers: [{ question: faq.question, answer: faq.answer }], buttons: AFTER_ANSWER });
      return;
    }
    if (ranked.length) {
      botSay({
        text: 'I am not sure I understood. Did you mean one of these?',
        buttons: [
          ...ranked.slice(0, 3).map((row) => ({ type: 'faq', faq: row.faq, label: row.faq.question })),
          LINKS.team,
        ],
      });
      return;
    }
    botSay({
      text: "I don't have an answer for that yet. You can pick one of these, or talk to our team.",
      buttons: MENU,
    });
  }

  async function ask(question, shown) {
    const q = String(question || '').trim();
    if (!q || busy) return;
    say({ from: 'me', text: shown || q });
    setText('');
    setBusy(true);
    try {
      const data = await askChatbot(q);
      if (data.answered) {
        botSay({ answers: data.answers, buttons: AFTER_ANSWER });
      } else {
        answerFromList(q);
      }
    } catch (err) {
      if (err?.response?.status === 429) {
        botSay({
          text: 'You have asked a lot of questions. Please try again a little later, or talk to our team.',
          buttons: [LINKS.team],
        });
      } else {
        answerFromList(q); // the server is not reachable: use the FAQ list only
      }
    } finally {
      setBusy(false);
    }
  }

  function pick(action) {
    if (action.type === 'team') goToTeam();
    else if (action.type === 'ask') ask(action.text, action.label);
    else if (action.type === 'packages') {
      say({ from: 'me', text: action.label });
      botSay({
        text: 'Here are our packages:',
        card: { kind: 'packages' },
        buttons: [{ type: 'package', label: 'Find my package' }, LINKS.request, { type: 'menu', label: 'Back to menu' }],
      });
    } else if (action.type === 'payment') {
      say({ from: 'me', text: action.label });
      botSay({
        text: action.kw ? `Here is the payment schedule for the ${action.kw} kW package:` : 'Here is how payment works:',
        card: { kind: 'payment', kw: action.kw || null },
        buttons: action.kw
          ? [LINKS.request, { type: 'menu', label: 'Back to menu' }]
          : [{ type: 'package', label: 'Find my package' }, { type: 'menu', label: 'Back to menu' }],
      });
    } else if (action.type === 'package') {
      say({ from: 'me', text: action.label });
      startPackageFinder();
    } else if (action.type === 'menu') showMenu();
    else if (action.type === 'browse') {
      say({ from: 'me', text: action.label });
      if (!faqs.length) {
        botSay({ text: 'The question list could not be loaded right now. Please pick one of these.', buttons: MENU });
      } else {
        botSay({
          text: 'Tap a question to read the answer.',
          buttons: [...faqs.slice(0, 10).map((f) => ({ type: 'faq', faq: f, label: f.question })), { type: 'menu', label: 'Back to menu' }],
        });
      }
    } else if (action.type === 'faq') {
      say({ from: 'me', text: action.faq.question });
      botSay({ answers: [{ question: action.faq.question, answer: action.faq.answer }], buttons: AFTER_ANSWER });
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    if (mode === 'bill') {
      say({ from: 'me', text: value });
      setText('');
      handleBill(value);
    } else if (billFromText(value) !== null) {
      // A typed amount, like "5000", is taken as the monthly bill
      say({ from: 'me', text: value });
      setText('');
      handleBill(billFromText(value));
    } else {
      ask(value);
    }
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
    <div className={`cbw-panel${closing ? ' is-closing' : ''}`} role="dialog" aria-label="Glomax Assistant">
      <div className="cbw-head">
        <span className="cbw-head-icon">
          <Bot size={19} />
        </span>
        <div className="cbw-head-text">
          <strong>Glomax Assistant</strong>
          <span><i className="cbw-online" />Online. Replies instantly</span>
        </div>
        <button type="button" className="cbw-close" onClick={closeChat} aria-label="Close chat">
          <X size={18} />
        </button>
      </div>

      <div className="cbw-body" ref={bodyRef}>
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1;
          const isMe = m.from === 'me';
          const isMenu = m.buttons === MENU;
          return (
            <div key={i} className={`cbw-wrap ${isMe ? 'me' : 'bot'}`}>
              <div className="cbw-line">
                {!isMe && (
                  <span className="cbw-avatar" aria-hidden="true">
                    <Bot size={15} />
                  </span>
                )}
                <div className={`cbw-msg ${isMe ? 'me' : 'bot'}`}>
                  {m.answers &&
                    m.answers.map((a) => (
                      <div className="cbw-answer" key={a.question}>
                        <strong>{a.question}</strong>
                        {a.answer}
                      </div>
                    ))}
                  {m.text}
                </div>
              </div>

              {m.card && (
                <div className="cbw-card-wrap">
                  <MessageCard card={m.card} />
                </div>
              )}

              {m.buttons && isLast && !busy && isMenu && (
                <div className="cbw-menu">
                  {m.buttons.map((b, j) => {
                    const Icon = MENU_ICONS[b.label] || ChevronRight;
                    const inner = (
                      <>
                        <span className="cbw-card-icon">
                          <Icon size={17} />
                        </span>
                        <span className="cbw-card-label">{b.label}</span>
                      </>
                    );
                    return b.type === 'link' ? (
                      <Link key={j} to={b.to} className="cbw-card" onClick={closeChat}>
                        {inner}
                      </Link>
                    ) : (
                      <button type="button" key={j} className="cbw-card" onClick={() => pick(b)}>
                        {inner}
                      </button>
                    );
                  })}
                </div>
              )}

              {m.buttons && isLast && !busy && !isMenu && (
                <div className="cbw-chips">
                  {m.buttons.map((b, j) =>
                    b.type === 'link' ? (
                      <Link key={j} to={b.to} className="cbw-chip cbw-chip-link" onClick={closeChat}>
                        {b.label}
                      </Link>
                    ) : b.type === 'faq' ? (
                      <button type="button" key={j} className="cbw-row" onClick={() => pick(b)}>
                        <span>{b.label}</span>
                        <ChevronRight size={15} />
                      </button>
                    ) : (
                      <button type="button" key={j} className={`cbw-chip${b.type === 'team' ? ' cbw-chip-link' : ''}`} onClick={() => pick(b)}>
                        {b.label}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="cbw-wrap bot">
            <div className="cbw-line">
              <span className="cbw-avatar" aria-hidden="true">
                <Bot size={15} />
              </span>
              <div className="cbw-msg bot cbw-typing" aria-label="Typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="cbw-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === 'bill' ? 'Monthly bill in pesos, e.g. 5000' : 'Type your question'}
          maxLength={300}
          aria-label={mode === 'bill' ? 'Monthly electric bill' : 'Type your question'}
        />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send">
          <Send size={17} />
        </button>
      </form>
      <p className="cbw-note">Automatic answers. Our team can help with anything else.</p>
    </div>
  );
}