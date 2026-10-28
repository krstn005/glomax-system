import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Home,
  Building2,
  Zap,
  Wrench,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
  ArrowDown,
  Sun,
  ShieldCheck,
  CheckCircle2,
  Check,
  ClipboardCheck,
  FileText,
  Hammer,
  Send,
  Mail,
  Phone,
  User,
  MapPin,
  Clock,
  Package,
  MessageCircle,
  HelpCircle,
  Loader2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { submitInquiry } from '../../../api/inquiries';
import { getPublicFaqs } from '../../../api/adminconfig';
import { sanitizePhoneNumber } from '../../../utils/phone';
import heroImage from '../assets/images/landing_hero.jpg';
import aboutImage from '../assets/images/landing_section.jpg';
import logo from '../../../assets/images/logo.jpg';
import '../styles/landing.css';

const NAV_ITEMS = [
  { id: 'hero', label: 'Home' },
  { id: 'about', label: 'About Us' },
  { id: 'services', label: 'Services' },
  { id: 'packages', label: 'Solar Packages' },
  { id: 'faqs', label: 'FAQs' },
  { id: 'contact', label: 'Contact Us' },
];

const HERO_STATS = [
  { value: '10+ Years', label: 'in the solar industry' },
  { value: '1 Year', label: 'panel warranty' },
  { value: '3KW - 10KW', label: 'systems for homes and businesses' },
];

const ABOUT_POINTS = [
  'Our own team checks your roof before any work starts',
  'Your quotation is sent straight to your email',
  'Track your request anytime from your account',
  '1-year warranty on every solar panel',
];

const STEPS = [
  {
    icon: Send,
    title: 'Send an inquiry',
    text: 'Fill out the short form below. No account needed yet.',
  },
  {
    icon: FileText,
    title: 'Get a quotation',
    text: 'We reply through your email with a quotation for your home.',
  },
  {
    icon: ClipboardCheck,
    title: 'Roof assessment',
    text: 'Our team visits your property to check if your roof is ready for solar.',
  },
  {
    icon: Hammer,
    title: 'Installation',
    text: 'Once approved, our installers set up your system and turn it on.',
  },
];

const SERVICES = [
  {
    icon: Home,
    tag: 'Most Popular',
    title: 'Residential Solar',
    description: "Perfect for homes. Reduce your monthly Meralco bill significantly with our 3KW-10KW systems.",
  },
  {
    icon: Building2,
    tag: 'Enterprise',
    title: 'Commercial Solar',
    description: 'Large-scale installations for offices, warehouses, and commercial buildings with high energy demands.',
  },
  {
    icon: Zap,
    tag: 'Best Value',
    title: 'Hybrid Systems',
    description: 'On-grid with battery backup. Store excess energy and use it at night or during power outages.',
  },
  {
    icon: Wrench,
    tag: 'After-Sales',
    title: 'Maintenance',
    description: 'Regular cleaning, inspection, and repair services to keep your solar system at peak performance.',
  },
];

// Pricing data sourced directly from the official rate sheet.
const PACKAGE_TIERS = [
  {
    tierLabel: 'Residential Starter',
    capacity: '3KW',
    roofArea: '20 sqm',
    panels: '6 panels',
    inverter: '3KW Inverter',
    onGrid: { price: 106000, monthlySavings: '\u20b12,500-3,000', roi: '5 years' },
    hybrid: { price: 215000, monthlySavings: '\u20b13,000', roi: '6 years' },
  },
  {
    tierLabel: 'Residential Standard',
    capacity: '6KW',
    roofArea: '30 sqm',
    panels: '10 panels',
    inverter: '6KW Inverter',
    mostPopular: true,
    onGrid: { price: 155000, monthlySavings: '\u20b14,000-4,500', roi: '4 years' },
    hybrid: { price: 260000, monthlySavings: '\u20b14,500', roi: '5 years' },
  },
  {
    tierLabel: 'Residential Premium',
    capacity: '8KW',
    roofArea: '42 sqm',
    panels: '14 panels',
    inverter: '8KW Inverter',
    onGrid: { price: 205000, monthlySavings: '\u20b16,000-6,500', roi: '4 years' },
    hybrid: { price: 335000, monthlySavings: '\u20b16,500', roi: '5 years' },
  },
  {
    tierLabel: 'Commercial',
    capacity: '10KW',
    roofArea: '55 sqm',
    panels: '18 panels',
    inverter: '10KW Inverter',
    onGrid: { price: 245000, monthlySavings: '\u20b17,500-8,000', roi: '3.5 years' },
    hybrid: { price: 375000, monthlySavings: '\u20b18,000', roi: '4 years' },
  },
];

// Only used when the server can't be reached. Normally the FAQs shown on
// this page are the ones Admin sets in Admin Settings > FAQs.
const FALLBACK_FAQS = [
  {
    id: 'fallback-1',
    question: 'What is the difference between On-Grid and Hybrid systems?',
    answer:
      'On-Grid connects your home to the regular power grid. It is the simpler and more affordable option. Hybrid adds a battery so you can still use power even when there is an outage or at night. Our team can help you figure out which one is right for your home during the roof check visit.',
  },
  {
    id: 'fallback-2',
    question: 'How do I get started?',
    answer:
      'Just fill out the short inquiry form on our website. No account needed yet. We will get back to you with a quotation. Once you decide to move forward that is when you create your account and submit your request.',
  },
  {
    id: 'fallback-3',
    question: 'Do I need to create an account to send an inquiry?',
    answer:
      'No. You can send us a message straight from our website without signing up. You only need to create an account after we send you a quotation and you decide to continue.',
  },
  {
    id: 'fallback-4',
    question: 'Do I need to be home during the roof check?',
    answer:
      'Yes, someone needs to be at the property when our team comes to visit. They will need to see the roof up close to check if it is suitable for solar panels.',
  },
  {
    id: 'fallback-5',
    question: 'What if my roof is not suitable for solar panels?',
    answer:
      'We will let you know right away and explain why. In some cases we may give you the chance to try again in the future. If that option is available you will see a button on your account that lets you submit a new request.',
  },
];

// Same values as before, so the backend does not need any changes.
const SUBJECT_OPTIONS = [
  {
    value: 'ROOF_ASSESSMENT',
    label: 'I want to request a roof assessment',
    short: 'Roof assessment',
    hint: 'Have my roof checked',
    icon: ClipboardCheck,
  },
  {
    value: 'PACKAGE_QUESTION',
    label: 'I have a question about solar packages',
    short: 'Solar packages',
    hint: 'Prices, sizes, quotation',
    icon: Package,
  },
  {
    value: 'OTHER',
    label: 'Other concern',
    short: 'Other concern',
    hint: 'Anything else',
    icon: MessageCircle,
  },
];

const NEXT_STEPS = [
  { icon: Mail, text: 'We read every inquiry and reply through your email.' },
  { icon: FileText, text: 'If you are asking about a package, we send you a quotation.' },
  { icon: Clock, text: 'Most inquiries get a reply as soon as possible on working days.' },
];

const MESSAGE_LIMIT = 1000;

const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone_number: '',
  subject: 'ROOF_ASSESSMENT',
  message: '',
};

function formatPeso(amount) {
  return `\u20b1${amount.toLocaleString()}`;
}

// Turns an API error into one short readable sentence.
function getErrorText(err) {
  const data = err?.response?.data;
  if (!data) return 'We could not reach the server. Please check your internet and try again.';
  if (typeof data === 'string') return 'Something went wrong sending your inquiry. Please try again.';
  if (data.detail) return data.detail;
  const firstKey = Object.keys(data)[0];
  if (firstKey) {
    const value = Array.isArray(data[firstKey]) ? data[firstKey][0] : data[firstKey];
    const field = firstKey.replace(/_/g, ' ');
    if (firstKey === 'non_field_errors') return String(value);
    return `${field.charAt(0).toUpperCase() + field.slice(1)}: ${value}`;
  }
  return 'Something went wrong sending your inquiry. Please try again.';
}

export default function LandingPage() {
  const navigate = useNavigate();
  const contactRef = useRef(null);
  const nameInputRef = useRef(null);

  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [packageType, setPackageType] = useState('onGrid');

  // FAQs come from Admin Settings. status: 'loading' | 'ready'
  const [faqs, setFaqs] = useState([]);
  const [faqStatus, setFaqStatus] = useState('loading');

  const [form, setForm] = useState(EMPTY_FORM);
  const [chosenPackage, setChosenPackage] = useState(null);
  const [phoneWarning, setPhoneWarning] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Load the FAQs that Admin set in Admin Settings.
  // If the server can't be reached, show the built-in list instead.
  useEffect(() => {
    let cancelled = false;
    getPublicFaqs()
      .then((data) => {
        if (cancelled) return;
        setFaqs(Array.isArray(data) ? data : []);
        setFaqStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setFaqs(FALLBACK_FAQS);
        setFaqStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Solid nav bar after scrolling a bit
  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 40);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Highlight the nav link of the section on screen
  useEffect(() => {
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Fade sections in while scrolling
  useEffect(() => {
    const items = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('lnd-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lnd-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Close the mobile menu with Esc or when the screen gets wide again
  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    function handleResize() {
      if (window.innerWidth > 960) setMenuOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleResize);
    };
  }, [menuOpen]);

  function scrollToElement(el) {
    if (!el) return;
    const navbarHeight = 76;
    const top = el.getBoundingClientRect().top + window.scrollY - navbarHeight;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  function scrollToSection(sectionId) {
    setMenuOpen(false);
    if (sectionId === 'contact') {
      scrollToElement(contactRef.current);
    } else {
      scrollToElement(document.getElementById(sectionId));
    }
  }

  function goToContact(subject) {
    if (subject) setForm((f) => ({ ...f, subject }));
    if (status !== 'submitting') setStatus('idle');
    scrollToSection('contact');
    setTimeout(() => nameInputRef.current?.focus({ preventScroll: true }), 700);
  }

  // "Get This Package" fills in the form for the customer
  function inquireAboutPackage(tier) {
    const typeLabel = packageType === 'onGrid' ? 'On-Grid' : 'Hybrid';
    const price = formatPeso(tier[packageType].price);
    setChosenPackage(`${tier.capacity} ${typeLabel}`);
    setForm((f) => ({
      ...f,
      subject: 'PACKAGE_QUESTION',
      message: `Hi! I'm interested in the ${tier.capacity} ${typeLabel} package (${tier.tierLabel}, ${price}). Can you send me a quotation?`,
    }));
    setStatus('idle');
    setErrorMessage('');
    scrollToSection('contact');
    setTimeout(() => nameInputRef.current?.focus({ preventScroll: true }), 700);
  }

  function clearChosenPackage() {
    setChosenPackage(null);
    setForm((f) => ({ ...f, message: '' }));
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (status === 'error') setStatus('idle');
  }

  function handleSubjectChange(value) {
    setForm((f) => ({ ...f, subject: value }));
    if (value !== 'PACKAGE_QUESTION') setChosenPackage(null);
  }

  function handlePhoneChange(e) {
    const { value, hadInvalidChar } = sanitizePhoneNumber(e.target.value);
    setForm((f) => ({ ...f, phone_number: value }));
    setPhoneWarning(hadInvalidChar ? 'Phone number can only contain numbers.' : '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage('');
    try {
      await submitInquiry({ ...form, message: form.message.trim() });
      setStatus('success');
      setForm(EMPTY_FORM);
      setChosenPackage(null);
      setPhoneWarning('');
    } catch (err) {
      console.error('Inquiry submission failed:', err);
      setStatus('error');
      setErrorMessage(getErrorText(err));
    }
  }

  const selectedSubject = SUBJECT_OPTIONS.find((o) => o.value === form.subject) || SUBJECT_OPTIONS[0];
  const messageLength = form.message.length;
  const year = new Date().getFullYear();

  return (
    <div className="lnd-page">
      {/* ---------- Nav bar ---------- */}
      <header className={`lnd-nav ${isScrolled || menuOpen ? 'lnd-nav-solid' : ''}`}>
        <div className="lnd-nav-inner">
          <button type="button" className="lnd-brand" onClick={() => scrollToSection('hero')}>
            <span className="lnd-brand-logo">
              <img src={logo} alt="" />
            </span>
            <span className="lnd-brand-text">
              <strong>Glomax Solar</strong>
              <small>Enterprises</small>
            </span>
          </button>

          <nav className="lnd-nav-links" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`lnd-nav-link ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => scrollToSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="lnd-nav-actions">
            <button type="button" className="lnd-nav-signin" onClick={() => navigate('/login')}>
              Sign In
            </button>
            <button type="button" className="lnd-btn lnd-btn-gold lnd-btn-sm" onClick={() => goToContact('PACKAGE_QUESTION')}>
              Get a Quote
            </button>
            <button
              type="button"
              className="lnd-menu-btn"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        <div className={`lnd-mobile-menu ${menuOpen ? 'open' : ''}`}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`lnd-mobile-link ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div className="lnd-mobile-actions">
            <button type="button" className="lnd-btn lnd-btn-ghost-dark" onClick={() => navigate('/login')}>
              Sign In
            </button>
            <button type="button" className="lnd-btn lnd-btn-gold" onClick={() => goToContact('PACKAGE_QUESTION')}>
              Get a Quote
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section id="hero" className="lnd-hero" style={{ backgroundImage: `url(${heroImage})` }}>
        <div className="lnd-hero-overlay" />
        <div className="lnd-container lnd-hero-inner">
          <div className="lnd-hero-content">
            <span className="lnd-hero-badge">
              <Sun size={15} />
              Solar installer based in Manila
            </span>
            <h1>
              Save on Electricity
              <br />
              <span>with Solar Energy</span>
            </h1>
            <p>
              Switch to clean, renewable solar energy and cut your electricity bills by up to 80%.
              Glomax Solar Enterprises provides professional installation for residential and
              commercial properties across the Philippines.
            </p>
            <div className="lnd-hero-buttons">
              <button type="button" className="lnd-btn lnd-btn-gold lnd-btn-lg" onClick={() => goToContact('ROOF_ASSESSMENT')}>
                Inquire Now
              </button>
              <button type="button" className="lnd-btn lnd-btn-glass lnd-btn-lg" onClick={() => scrollToSection('packages')}>
                View Packages
              </button>
            </div>
          </div>

          <div className="lnd-hero-stats">
            {HERO_STATS.map((stat) => (
              <div className="lnd-hero-stat" key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <button type="button" className="lnd-scroll-hint" onClick={() => scrollToSection('about')} aria-label="Scroll down">
          <ArrowDown size={18} />
        </button>
      </section>

      {/* ---------- About ---------- */}
      <section id="about" className="lnd-section">
        <div className="lnd-container lnd-about" data-reveal>
          <div className="lnd-about-media">
            <div className="lnd-about-frame">
              <img src={aboutImage} alt="Glomax solar installation team at work" />
            </div>
            <div className="lnd-about-badge">
              <strong>2014</strong>
              <span>Powering homes since</span>
            </div>
          </div>

          <div className="lnd-about-text">
            <span className="lnd-eyebrow">About Us</span>
            <h2 className="lnd-title">Powering Filipino Homes Since 2014</h2>
            <p className="lnd-lead">
              Glomax Solar Enterprises is a solar installation company based in Manila, Philippines
              with over 10 years of experience helping homeowners get solar panels installed at
              their properties.
            </p>
            <p className="lnd-body">
              We are committed to making clean and renewable energy accessible and affordable for
              every Filipino family.
            </p>
            <ul className="lnd-about-points">
              {ABOUT_POINTS.map((point) => (
                <li key={point}>
                  <span className="lnd-check">
                    <Check size={14} strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="lnd-section lnd-section-tint">
        <div className="lnd-container">
          <div className="lnd-section-head" data-reveal>
            <span className="lnd-eyebrow">How It Works</span>
            <h2 className="lnd-title">From Inquiry to Installation in 4 Steps</h2>
            <p className="lnd-subtitle">No account needed to get started. Just send us a message.</p>
          </div>

          <ol className="lnd-steps" data-reveal>
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li className="lnd-step" key={step.title}>
                  <div className="lnd-step-top">
                    <span className="lnd-step-icon">
                      <Icon size={22} />
                    </span>
                    <span className="lnd-step-num">0{i + 1}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ---------- Services ---------- */}
      <section id="services" className="lnd-section">
        <div className="lnd-container">
          <div className="lnd-section-head" data-reveal>
            <span className="lnd-eyebrow">Our Services</span>
            <h2 className="lnd-title">Solar Solutions for Every Need</h2>
            <p className="lnd-subtitle">
              From residential homes to large commercial buildings, we have the right solar package
              for you.
            </p>
          </div>

          <div className="lnd-services" data-reveal>
            {SERVICES.map((service) => {
              const Icon = service.icon;
              return (
                <article className="lnd-service" key={service.title}>
                  <div className="lnd-service-top">
                    <span className="lnd-service-icon">
                      <Icon size={22} />
                    </span>
                    <span className="lnd-service-tag">{service.tag}</span>
                  </div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Packages ---------- */}
      <section id="packages" className="lnd-section lnd-section-navy">
        <div className="lnd-container">
          <div className="lnd-section-head lnd-section-head-light" data-reveal>
            <span className="lnd-eyebrow">Solar Packages</span>
            <h2 className="lnd-title">Choose the Right System for You</h2>
            <p className="lnd-subtitle">
              On-Grid is the budget-friendly choice. Hybrid adds a battery for power at night and
              during brownouts.
            </p>
          </div>

          <div className="lnd-toggle-wrap" data-reveal>
            <div className={`lnd-toggle ${packageType === 'hybrid' ? 'right' : ''}`} role="tablist" aria-label="Package type">
              <span className="lnd-toggle-pill" aria-hidden="true" />
              <button
                type="button"
                role="tab"
                aria-selected={packageType === 'onGrid'}
                className={packageType === 'onGrid' ? 'active' : ''}
                onClick={() => setPackageType('onGrid')}
              >
                <Sun size={16} />
                On-Grid
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={packageType === 'hybrid'}
                className={packageType === 'hybrid' ? 'active' : ''}
                onClick={() => setPackageType('hybrid')}
              >
                <Zap size={16} />
                Hybrid
              </button>
            </div>
          </div>

          <div className="lnd-packages" data-reveal>
            {PACKAGE_TIERS.map((tier) => {
              const data = tier[packageType];
              return (
                <article className={`lnd-package ${tier.mostPopular ? 'featured' : ''}`} key={tier.capacity}>
                  {tier.mostPopular && <span className="lnd-package-badge">Most Popular</span>}
                  <p className="lnd-package-label">{tier.tierLabel}</p>
                  <h3>
                    {tier.capacity}
                    <span>{packageType === 'onGrid' ? 'On-Grid' : 'Hybrid'}</span>
                  </h3>
                  <div className="lnd-package-price">{formatPeso(data.price)}</div>
                  <p className="lnd-package-save">Save about {data.monthlySavings} a month</p>

                  <ul className="lnd-package-specs">
                    <li><Check size={15} strokeWidth={3} />{tier.panels}</li>
                    <li><Check size={15} strokeWidth={3} />{tier.inverter}</li>
                    <li><Check size={15} strokeWidth={3} />Roof area: {tier.roofArea}</li>
                    {packageType === 'hybrid' && (
                      <li><Check size={15} strokeWidth={3} />Battery backup (100AH)</li>
                    )}
                    <li><Check size={15} strokeWidth={3} />Pays for itself in {data.roi}</li>
                    <li><Check size={15} strokeWidth={3} />1-year warranty</li>
                  </ul>

                  <button
                    type="button"
                    className={`lnd-btn ${tier.mostPopular ? 'lnd-btn-gold' : 'lnd-btn-outline-light'} lnd-btn-block`}
                    onClick={() => inquireAboutPackage(tier)}
                  >
                    Get This Package
                  </button>
                </article>
              );
            })}
          </div>

          <p className="lnd-packages-note" data-reveal>
            <Info size={15} />
            Final price is confirmed after the roof assessment. Already have an account?{' '}
            <Link to="/login">Sign in to request</Link>
          </p>
        </div>
      </section>

      {/* ---------- FAQs (set by Admin in Admin Settings) ---------- */}
      <section id="faqs" className="lnd-section">
        <div className="lnd-container lnd-faq" data-reveal>
          <div className="lnd-faq-side">
            <span className="lnd-eyebrow">FAQs</span>
            <h2 className="lnd-title">Frequently Asked Questions</h2>
            <p className="lnd-body">
              Quick answers to what most homeowners ask us before getting solar.
            </p>
            <div className="lnd-help-card">
              <span className="lnd-help-icon">
                <HelpCircle size={22} />
              </span>
              <div>
                <h3>Still have questions?</h3>
                <p>Send us a message and our team will get back to you.</p>
                <button type="button" className="lnd-text-link" onClick={() => goToContact('OTHER')}>
                  Ask us directly
                </button>
              </div>
            </div>
          </div>

          <div className="lnd-faq-list">
            {faqStatus === 'loading' && <p className="lnd-body">Loading questions...</p>}

            {faqStatus === 'ready' && faqs.length === 0 && (
              <p className="lnd-body">
                No questions have been posted yet. Send us a message and we will gladly help.
              </p>
            )}

            {faqStatus === 'ready' &&
              faqs.map((faq, index) => {
                const isOpen = openFaqIndex === index;
                return (
                  <div className={`lnd-faq-item ${isOpen ? 'open' : ''}`} key={faq.id}>
                    <button
                      type="button"
                      className="lnd-faq-q"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    >
                      <span>{faq.question}</span>
                      <span className="lnd-faq-chevron">
                        <ChevronDown size={18} />
                      </span>
                    </button>
                    <div className="lnd-faq-a">
                      <div className="lnd-faq-a-inner">
                        <p>{faq.answer}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      {/* ---------- Contact ---------- */}
      <section id="contact" ref={contactRef} className="lnd-section lnd-section-tint">
        <div className="lnd-container">
          <div className="lnd-section-head" data-reveal>
            <span className="lnd-eyebrow">Contact Us</span>
            <h2 className="lnd-title">Send Us an Inquiry</h2>
            <p className="lnd-subtitle">
              Fill out the form and we will get back to you through your email as soon as possible.
            </p>
          </div>

          <div className="lnd-contact" data-reveal>
            {/* Info side */}
            <aside className="lnd-contact-info">
              <div className="lnd-contact-glow" aria-hidden="true" />
              <div className="lnd-contact-info-top">
                <h3>What happens next?</h3>
                <ol className="lnd-next-steps">
                  {NEXT_STEPS.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <li key={step.text}>
                        <span className="lnd-next-icon">
                          <Icon size={17} />
                          <em>{i + 1}</em>
                        </span>
                        <p>{step.text}</p>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="lnd-contact-facts">
                <div className="lnd-fact">
                  <MapPin size={17} />
                  <span>Based in Manila, Philippines</span>
                </div>
                <div className="lnd-fact">
                  <ShieldCheck size={17} />
                  <span>No account needed to send an inquiry</span>
                </div>
              </div>

              <div className="lnd-contact-info-bottom">
                <span>Already a customer?</span>
                <Link to="/login">
                  Sign in to your account
                </Link>
              </div>
            </aside>

            {/* Form side */}
            <div className="lnd-form-card">
              {status === 'success' ? (
                <div className="lnd-success">
                  <span className="lnd-success-icon">
                    <CheckCircle2 size={38} />
                  </span>
                  <h3>Inquiry sent!</h3>
                  <p>
                    Thank you for reaching out. We received your message and will reply through
                    your email soon. Please also check your spam folder.
                  </p>
                  <div className="lnd-success-actions">
                    <button type="button" className="lnd-btn lnd-btn-navy" onClick={() => setStatus('idle')}>
                      Send another inquiry
                    </button>
                    <button type="button" className="lnd-btn lnd-btn-soft" onClick={() => scrollToSection('packages')}>
                      Browse packages
                    </button>
                  </div>
                </div>
              ) : (
                <form className="lnd-form" onSubmit={handleSubmit}>
                  {/* Subject picker (replaces the old dropdown) */}
                  <fieldset className="lnd-fieldset">
                    <legend className="lnd-label">What can we help you with?</legend>
                    <div className="lnd-subjects">
                      {SUBJECT_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const checked = form.subject === opt.value;
                        return (
                          <label key={opt.value} className={`lnd-subject ${checked ? 'checked' : ''}`}>
                            <input
                              type="radio"
                              name="subject"
                              value={opt.value}
                              checked={checked}
                              onChange={() => handleSubjectChange(opt.value)}
                              className="lnd-sr-only"
                            />
                            <span className="lnd-subject-icon">
                              <Icon size={18} />
                            </span>
                            <span className="lnd-subject-text">
                              <strong>{opt.short}</strong>
                              <small>{opt.hint}</small>
                            </span>
                            <span className="lnd-subject-check" aria-hidden="true">
                              <Check size={12} strokeWidth={3.5} />
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="lnd-row">
                    <div className="lnd-field">
                      <label className="lnd-label" htmlFor="full_name">Full Name</label>
                      <div className="lnd-input">
                        <User size={17} className="lnd-input-icon" />
                        <input
                          ref={nameInputRef}
                          id="full_name"
                          name="full_name"
                          type="text"
                          autoComplete="name"
                          placeholder="Juan Dela Cruz"
                          value={form.full_name}
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="lnd-field">
                      <label className="lnd-label" htmlFor="phone_number">Phone Number</label>
                      <div className="lnd-input">
                        <Phone size={17} className="lnd-input-icon" />
                        <input
                          id="phone_number"
                          name="phone_number"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          placeholder="09171234567"
                          value={form.phone_number}
                          onChange={handlePhoneChange}
                          required
                        />
                      </div>
                      {phoneWarning && (
                        <p className="lnd-field-warn">
                          <AlertCircle size={13} />
                          {phoneWarning}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="lnd-field">
                    <label className="lnd-label" htmlFor="email">Email Address</label>
                    <div className="lnd-input">
                      <Mail size={17} className="lnd-input-icon" />
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="juan@email.com"
                        value={form.email}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <p className="lnd-field-hint">We will send our reply to this email.</p>
                  </div>

                  <div className="lnd-field">
                    <div className="lnd-label-row">
                      <label className="lnd-label" htmlFor="message">Message</label>
                      {chosenPackage && form.subject === 'PACKAGE_QUESTION' && (
                        <span className="lnd-chip">
                          <Package size={13} />
                          {chosenPackage}
                          <button type="button" onClick={clearChosenPackage} aria-label="Remove package">
                            <X size={12} />
                          </button>
                        </span>
                      )}
                    </div>
                    <textarea
                      id="message"
                      name="message"
                      rows={5}
                      maxLength={MESSAGE_LIMIT}
                      placeholder={
                        selectedSubject.value === 'ROOF_ASSESSMENT'
                          ? 'Tell us your city or barangay and the type of roof you have...'
                          : selectedSubject.value === 'PACKAGE_QUESTION'
                          ? 'Which package are you interested in? Ask us anything about it...'
                          : 'Describe your concern or inquiry here...'
                      }
                      value={form.message}
                      onChange={handleChange}
                      required
                    />
                    <div className="lnd-message-foot">
                      <p className="lnd-field-hint">
                        Following up on an earlier inquiry? Mention your name and roughly when you
                        first reached out.
                      </p>
                      <span className={`lnd-counter ${messageLength > MESSAGE_LIMIT - 50 ? 'warn' : ''}`}>
                        {messageLength}/{MESSAGE_LIMIT}
                      </span>
                    </div>
                  </div>

                  {status === 'error' && (
                    <div className="lnd-form-error" role="alert">
                      <AlertCircle size={17} />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button type="submit" className="lnd-btn lnd-btn-gold lnd-btn-lg lnd-btn-block" disabled={status === 'submitting'}>
                    {status === 'submitting' ? (
                      <>
                        <Loader2 size={18} className="lnd-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        Send Inquiry
                        <Send size={17} />
                      </>
                    )}
                  </button>
                  <p className="lnd-form-note">
                    By sending this form, you agree that we may contact you about your inquiry.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- CTA strip ---------- */}
      <section className="lnd-cta">
        <div className="lnd-container lnd-cta-inner" data-reveal>
          <div>
            <h2>Ready to lower your electric bill?</h2>
            <p>Start with a free inquiry. We will help you pick the right system for your home.</p>
          </div>
          <div className="lnd-cta-buttons">
            <button type="button" className="lnd-btn lnd-btn-navy lnd-btn-lg" onClick={() => goToContact('ROOF_ASSESSMENT')}>
              Request a Roof Check
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="lnd-footer">
        <div className="lnd-container lnd-footer-grid">
          <div className="lnd-footer-brand">
            <div className="lnd-footer-logo">
              <span className="lnd-brand-logo">
                <img src={logo} alt="" />
              </span>
              <strong>Glomax Solar Enterprises</strong>
            </div>
            <p>
              Clean and affordable solar energy for Filipino homes and businesses since 2014.
            </p>
            <span className="lnd-footer-place">
              <MapPin size={15} />
              Manila, Philippines
            </span>
          </div>

          <div className="lnd-footer-col">
            <h4>Explore</h4>
            {NAV_ITEMS.slice(1).map((item) => (
              <button key={item.id} type="button" onClick={() => scrollToSection(item.id)}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="lnd-footer-col">
            <h4>Customers</h4>
            <Link to="/login">Sign In</Link>
            <Link to="/register">Create an Account</Link>
            <button type="button" onClick={() => goToContact('ROOF_ASSESSMENT')}>Request a Roof Check</button>
          </div>

          <div className="lnd-footer-col">
            <h4>Team Login</h4>
            <Link to="/staff-login">Staff</Link>
            <Link to="/partner-installer-login">Partner Installer</Link>
            <Link to="/admin-login">Admin</Link>
          </div>
        </div>

        <div className="lnd-container lnd-footer-bottom">
          <p>&copy; {year} Glomax Solar Enterprises. All rights reserved.</p>
          <button type="button" onClick={() => scrollToSection('hero')}>
            Back to top <ArrowRight size={14} className="lnd-up" />
          </button>
        </div>
      </footer>
    </div>
  );
}