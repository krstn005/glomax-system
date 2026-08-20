import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Building2, Zap, Wrench, ChevronDown } from 'lucide-react';
import { submitInquiry } from '../../../api/inquiries';
import { sanitizePhoneNumber } from '../../../utils/phone';
import heroImage from '../assets/images/landing_hero.jpg';
import aboutImage from '../assets/images/landing_section.jpg';
import logo from '../../../assets/images/logo.jpg';
import '../styles/landing.css';

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

const FAQS = [
  {
    question: 'What is the difference between On-Grid and Hybrid systems?',
    answer:
      'On-Grid connects your home to the regular power grid. It is the simpler and more affordable option. Hybrid adds a battery so you can still use power even when there is an outage or at night. Our team can help you figure out which one is right for your home during the roof check visit.',
  },
  {
    question: 'How do I get started?',
    answer:
      'Just fill out the short inquiry form on our website. No account needed yet. We will get back to you with a quotation. Once you decide to move forward that is when you create your account and submit your request.',
  },
  {
    question: 'Do I need to create an account to send an inquiry?',
    answer:
      'No. You can send us a message straight from our website without signing up. You only need to create an account after we send you a quotation and you decide to continue.',
  },
  {
    question: 'Do I need to be home during the roof check?',
    answer:
      'Yes, someone needs to be at the property when our team comes to visit. They will need to see the roof up close to check if it is suitable for solar panels.',
  },
  {
    question: 'What if my roof is not suitable for solar panels?',
    answer:
      'We will let you know right away and explain why. In some cases we may give you the chance to try again in the future. If that option is available you will see a button on your account that lets you submit a new request.',
  },
];

const SUBJECT_OPTIONS = [
  { value: 'ROOF_ASSESSMENT', label: 'I want to request a roof assessment' },
  { value: 'PACKAGE_QUESTION', label: 'I have a question about solar packages' },
  { value: 'OTHER', label: 'Other concern' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const contactRef = useRef(null);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [packageType, setPackageType] = useState('onGrid');
  const [selectedCapacity, setSelectedCapacity] = useState(
    () => PACKAGE_TIERS.find((t) => t.mostPopular)?.capacity || PACKAGE_TIERS[0].capacity
  );

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    subject: 'ROOF_ASSESSMENT',
    message: '',
  });
  const [phoneWarning, setPhoneWarning] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 40);
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  function scrollToElement(el) {
    if (!el) return;
    const navbarHeight = 88; // matches scroll-margin-top in landing.css
    const topPosition = el.getBoundingClientRect().top + window.scrollY - navbarHeight;
    window.scrollTo({ top: topPosition, behavior: 'smooth' });
  }

  function scrollToContact() {
    scrollToElement(contactRef.current);
  }

  function scrollToSection(sectionId) {
    scrollToElement(document.getElementById(sectionId));
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handlePhoneChange(e) {
    const { value, hadInvalidChar } = sanitizePhoneNumber(e.target.value);
    setForm({ ...form, phone_number: value });
    setPhoneWarning(hadInvalidChar ? 'Phone Number can only contain numbers.' : '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');
    try {
      await submitInquiry(form);
      setStatus('success');
      setForm({ full_name: '', email: '', phone_number: '', subject: 'ROOF_ASSESSMENT', message: '' });
    } catch (err) {
      setStatus('error');
      console.error('Inquiry submission failed:', err);
      setErrorMessage('Something went wrong sending your inquiry. Please try again.');
    }
  }

  return (
    <div className="landing-page">
      {/* Nav bar */}
      <nav className={`landing-navbar ${isScrolled ? 'landing-navbar-solid' : 'landing-navbar-transparent'}`}>
        <div className="landing-navbar-brand">
          <img src={logo} alt="Glomax Solar Enterprises" className="landing-navbar-logo" />
          <span>Glomax Solar Enterprises</span>
        </div>
        <div className="landing-navbar-links">
          <a onClick={() => scrollToSection('hero')}>Home</a>
          <a onClick={() => scrollToSection('about')}>About Us</a>
          <a onClick={() => scrollToSection('services')}>Services</a>
          <a onClick={() => scrollToSection('packages')}>Solar Packages</a>
          <a onClick={() => scrollToSection('faqs')}>FAQs</a>
          <a onClick={scrollToContact}>Contact Us</a>
        </div>
        <div className="landing-navbar-actions">
          <button className="landing-signin-link" onClick={() => navigate('/login')}>
            Sign In
          </button>
          <button className="landing-login-btn" onClick={() => navigate('/login')}>
            Login
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="hero"
        className="landing-hero"
        style={{ backgroundImage: `linear-gradient(to right, rgba(15, 30, 53, 0.85), rgba(15, 30, 53, 0.5)), url(${heroImage})` }}
      >
        <div className="landing-hero-content">
          <h1>
            Save on Electricity
            <br />
            <span className="highlight">with Solar Energy</span>
          </h1>
          <p>
            Switch to clean, renewable solar energy and cut your electricity bills by up to 80%.
            Glomax Solar Enterprises provides professional installation for residential and
            commercial properties across the Philippines.
          </p>
          <div className="landing-hero-buttons">
            <button className="landing-btn-primary" onClick={scrollToContact}>
              Inquire Now
            </button>
            <a href="#services" style={{ textDecoration: 'none' }}>
              <button className="landing-btn-secondary">View Our Services</button>
            </a>
          </div>
          <div className="landing-hero-stats">
            <div className="landing-hero-stat">
              <strong>10+ Years</strong>
              <span>in the Solar Industry</span>
            </div>
            <div className="landing-hero-stat">
              <strong>98%</strong>
              <span>Satisfaction Rate</span>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="landing-section">
        <div className="landing-about-grid">
          <div>
            <div className="landing-section-label">About Us</div>
            <h2>Powering Filipino Homes Since 2014</h2>
            <p>
              Switch to clean, renewable solar energy and cut your electricity bills by up to 80%.
              Glomax Solar Enterprises provides professional installation for residential and
              commercial properties across the Philippines.
            </p>
            <p>
              Glomax Enterprises Solar is a solar installation company based in Manila, Philippines
              with over 10 years of experience helping homeowners get solar panels installed at
              their properties. We are committed to making clean and renewable energy accessible
              and affordable for every Filipino family.
            </p>
          </div>
          <img src={aboutImage} alt="Glomax solar installation team" className="landing-about-image" />
        </div>
      </section>

      {/* Services */}
      <section id="services" className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-label" style={{ textAlign: 'center' }}>Our Services</div>
          <h2 style={{ textAlign: 'center' }}>Solar Solutions for Every Need</h2>
          <p style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
            From residential homes to large commercial buildings, we have the right solar package
            for you.
          </p>
        </div>
        <div className="landing-grid">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <div className="landing-package-card" key={service.title}>
                <div className="landing-service-icon">
                  <Icon size={20} />
                </div>
                <div className="landing-package-tag">{service.tag}</div>
                <h3>{service.title}</h3>
                <p className="landing-package-subtitle">{service.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Solar Packages */}
      <section id="packages" className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-label" style={{ textAlign: 'center' }}>Solar Packages</div>
          <h2 style={{ textAlign: 'center' }}>Choose the Right System for You</h2>
        </div>

        <div className="landing-package-toggle">
          <button
            className={packageType === 'onGrid' ? 'active' : ''}
            onClick={() => setPackageType('onGrid')}
          >
            On-Grid
          </button>
          <button
            className={packageType === 'hybrid' ? 'active' : ''}
            onClick={() => setPackageType('hybrid')}
          >
            Hybrid
          </button>
        </div>

        <div className="landing-grid landing-grid-4">
          {PACKAGE_TIERS.map((tier) => {
            const data = tier[packageType];
            const isSelected = tier.capacity === selectedCapacity;
            return (
              <div
                className={`landing-package-card landing-package-selectable ${isSelected ? 'landing-package-featured' : ''}`}
                key={tier.capacity}
                onClick={() => setSelectedCapacity(tier.capacity)}
              >
                {isSelected && (
                  <div className="landing-package-badge">
                    {tier.mostPopular ? 'Most Popular' : 'Selected'}
                  </div>
                )}
                <h3>{tier.capacity} {packageType === 'onGrid' ? 'On-Grid' : 'Hybrid'}</h3>
                <p className="landing-package-subtitle">{tier.tierLabel}</p>
                <div className="landing-package-price">&#8369;{data.price.toLocaleString()}</div>
                <ul className="landing-package-specs">
                  <li>{tier.panels}</li>
                  <li>{tier.inverter}</li>
                  <li>Roof area: {tier.roofArea}</li>
                  {packageType === 'hybrid' && <li>Battery Backup (100AH)</li>}
                  <li>Est. savings: {data.monthlySavings}/mo</li>
                  <li>Return on investment: {data.roi}</li>
                  <li>25-Year Warranty</li>
                </ul>
                <button
                  className={isSelected ? 'landing-btn-primary' : 'landing-btn-outline'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCapacity(tier.capacity);
                    navigate('/login');
                  }}
                >
                  Get This Package
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQs */}
      <section id="faqs" className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-label" style={{ textAlign: 'center' }}>FAQs</div>
          <h2 style={{ textAlign: 'center' }}>Frequently Asked Questions</h2>
        </div>
        <div className="landing-faq-list">
          {FAQS.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <div className="landing-faq-item" key={faq.question}>
                <button
                  type="button"
                  className="landing-faq-question"
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                >
                  <span>{faq.question}</span>
                  <span className={`landing-faq-chevron ${isOpen ? 'open' : ''}`}>
                    <ChevronDown size={18} />
                  </span>
                </button>
                <div className={`landing-faq-answer-wrapper ${isOpen ? 'open' : ''}`}>
                  <div className="landing-faq-answer-inner">
                    <div className="landing-faq-answer">{faq.answer}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Contact / Inquiry form */}
      <section className="landing-section landing-contact" ref={contactRef}>
        <div className="landing-section-header">
          <div className="landing-section-label" style={{ textAlign: 'center' }}>Contact Us</div>
          <h2 style={{ textAlign: 'center' }}>Send Us an Inquiry</h2>
          <p style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
            Fill out the form below and we will get back to you through your email as soon as possible.
          </p>
        </div>

        <div className="landing-form-wrapper">
          {status === 'success' && (
            <div className="landing-form-success">
              Thank you! Your inquiry has been received. We'll get back to you soon.
            </div>
          )}
          {status === 'error' && <div className="landing-form-error">{errorMessage}</div>}

          <form className="landing-form" onSubmit={handleSubmit}>
            <div className="landing-form-row">
              <div className="landing-form-field">
                <label htmlFor="full_name">Full Name</label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  value={form.full_name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="landing-form-field">
                <label htmlFor="phone_number">Phone Number</label>
                <input
                  id="phone_number"
                  name="phone_number"
                  type="tel"
                  inputMode="numeric"
                  value={form.phone_number}
                  onChange={handlePhoneChange}
                  required
                />
                {phoneWarning && <p className="landing-field-warning">{phoneWarning}</p>}
              </div>
            </div>

            <div className="landing-form-row">
              <div className="landing-form-field">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="landing-form-field">
                <label htmlFor="subject">Subject</label>
                <select id="subject" name="subject" value={form.subject} onChange={handleChange}>
                  {SUBJECT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="landing-form-field">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                name="message"
                placeholder="Describe your concern or inquiry here..."
                value={form.message}
                onChange={handleChange}
                required
              />
              <p className="landing-field-hint">
                If this is a follow-up to a previous inquiry, please mention it in your message
                (e.g. your name and roughly when you first reached out) so our team can assist
                you faster.
              </p>
            </div>

            <button type="submit" className="landing-btn-primary" disabled={status === 'submitting'}>
              {status === 'submitting' ? 'Sending...' : 'Send Inquiry'}
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>&copy; {new Date().getFullYear()} Glomax Solar Enterprises. All rights reserved.</p>
      </footer>
    </div>
  );
}