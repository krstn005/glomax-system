import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitInquiry } from '../../../api/inquiries';
import heroImage from '../assets/images/landing_hero.jpg';
import aboutImage from '../assets/images/landing_section.jpg';
import '../styles/landing.css';

const SERVICES = [
  {
    title: 'Residential Installation',
    description: 'Custom solar systems designed for homes, sized to your household\'s energy needs.',
  },
  {
    title: 'Commercial Installation',
    description: 'Scalable solar solutions for businesses looking to cut operating costs.',
  },
  {
    title: 'Free Roof Assessment',
    description: 'Our certified installers evaluate your roof to recommend the right system.',
  },
  {
    title: 'Maintenance & Support',
    description: 'Ongoing support to keep your system running at peak efficiency.',
  },
];

const PACKAGES = [
  { name: '3kW On-Grid', capacity: '3 kW', description: 'Ideal for small households with modest electricity usage.' },
  { name: '5kW On-Grid', capacity: '5 kW', description: 'Our most popular package for average-sized homes.' },
  { name: '6kW Hybrid', capacity: '6 kW', description: 'On-grid with battery backup for outages.' },
];

const FAQS = [
  {
    question: 'How long does installation take?',
    answer: 'Most residential installations are completed within 1-3 days after the roof assessment and approval process.',
  },
  {
    question: 'Do I need to replace my roof first?',
    answer: 'Not necessarily - our free roof assessment will tell you if any repairs are needed before installation.',
  },
  {
    question: 'What happens during a power outage?',
    answer: 'Standard on-grid systems shut off for safety during outages. Hybrid packages with battery backup keep essential loads running.',
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

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone_number: '',
    subject: 'ROOF_ASSESSMENT',
    message: '',
  });
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [errorMessage, setErrorMessage] = useState('');

  function scrollToContact() {
    contactRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
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
      <nav className="landing-navbar">
        <div className="landing-navbar-brand">
          <span>&#9728;</span>
          <span>Glomax Solar Enterprises</span>
        </div>
        <div className="landing-navbar-links">
          <a href="#hero">Home</a>
          <a href="#about">About Us</a>
          <a href="#services">Services</a>
          <a href="#faqs">FAQs</a>
          <a href="#packages">Solar Packages</a>
          <a onClick={scrollToContact}>Contact Us</a>
        </div>
        <button className="landing-login-btn" onClick={() => navigate('/login')}>
          Login
        </button>
      </nav>

      {/* Hero */}
      <section
        id="hero"
        className="landing-hero"
        style={{ backgroundImage: `linear-gradient(to right, rgba(15, 30, 53, 0.85), rgba(15, 30, 53, 0.5)), url(${heroImage})` }}
      >
        <div className="landing-hero-content">
          <span className="landing-hero-badge">&#9728; Professional Solar Installation in the Philippines</span>
          <h1>
            Save on Electricity <span className="highlight">with Solar Energy</span>
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
              <strong>500+</strong>
              <span>Installations</span>
            </div>
            <div className="landing-hero-stat">
              <strong>10+</strong>
              <span>Years Experience</span>
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
              Glomax Solar Enterprises is a trusted solar installation company with over 10 years
              of experience serving residential and commercial clients across the Philippines. We
              are committed to making clean, renewable energy accessible and affordable for every
              Filipino family. Our team of certified solar technicians and engineers ensures every
              installation meets the highest safety and quality standards.
            </p>
          </div>
          <img src={aboutImage} alt="Glomax solar installation team" className="landing-about-image" />
        </div>
      </section>

      {/* Services */}
      <section id="services" className="landing-section">
        <div className="landing-section-label">Services</div>
        <h2>What We Offer</h2>
        <div className="landing-grid">
          {SERVICES.map((service) => (
            <div className="landing-card" key={service.title}>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Solar Packages */}
      <section id="packages" className="landing-section">
        <div className="landing-section-label">Solar Packages</div>
        <h2>Choose the Right System for You</h2>
        <div className="landing-grid">
          {PACKAGES.map((pkg) => (
            <div className="landing-card" key={pkg.name}>
              <h3>{pkg.name}</h3>
              <p style={{ color: '#d99e00', fontWeight: 700, marginBottom: 6 }}>{pkg.capacity}</p>
              <p>{pkg.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs */}
      <section id="faqs" className="landing-section">
        <div className="landing-section-label">FAQs</div>
        <h2>Frequently Asked Questions</h2>
        <div>
          {FAQS.map((faq, index) => (
            <div className="landing-faq-item" key={faq.question}>
              <div
                className="landing-faq-question"
                onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
              >
                <span>{faq.question}</span>
                <span>{openFaqIndex === index ? '\u2212' : '+'}</span>
              </div>
              {openFaqIndex === index && <div className="landing-faq-answer">{faq.answer}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Contact / Inquiry form */}
      <section className="landing-section landing-contact" ref={contactRef}>
        <div className="landing-section-label">Contact Us</div>
        <h2>Send Us an Inquiry</h2>
        <p>Fill out the form below and we will get back to you as soon as possible.</p>

        {status === 'success' && (
          <div className="landing-form-success" style={{ marginTop: 16 }}>
            Thank you! Your inquiry has been received. We'll get back to you soon.
          </div>
        )}
        {status === 'error' && (
          <div className="landing-form-error" style={{ marginTop: 16 }}>
            {errorMessage}
          </div>
        )}

        <form className="landing-form" onSubmit={handleSubmit}>
          <div>
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

          <div>
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

          <div>
            <label htmlFor="phone_number">Phone Number</label>
            <input
              id="phone_number"
              name="phone_number"
              type="tel"
              value={form.phone_number}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label htmlFor="subject">Subject</label>
            <select id="subject" name="subject" value={form.subject} onChange={handleChange}>
              {SUBJECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="message">Message</label>
            <textarea
              id="message"
              name="message"
              placeholder="Describe your concern or inquiry here..."
              value={form.message}
              onChange={handleChange}
              required
            />
          </div>

          <button
            type="submit"
            className="landing-btn-primary"
            disabled={status === 'submitting'}
            style={{ justifySelf: 'start' }}
          >
            {status === 'submitting' ? 'Sending...' : 'Send Inquiry'}
          </button>
        </form>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>&copy; {new Date().getFullYear()} Glomax Solar Enterprises. All rights reserved.</p>
      </footer>
    </div>
  );
}