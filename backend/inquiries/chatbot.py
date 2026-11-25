"""
The FAQ chatbot (automatic reply).

How it works, in plain words:
  1. A customer sends an inquiry, or writes a follow-up message, or asks
     a question in the chat box on the website.
  2. We look through the saved FAQs (Admin > Chatbot FAQs). Each FAQ has
     keywords. A word in the message that matches a keyword earns 1
     point. A phrase (two or more words, like "roof assessment") earns 2.
  3. An FAQ needs at least 2 points to count. The best match is used
     (and a second one when it scored almost as well).
  4. If nothing matches, the chatbot stays quiet and Staff handle the
     message as before.

This is a simple rule-based chatbot on purpose. It never makes up an
answer: it only repeats what Admin wrote in the FAQ list.
"""
import logging
import re
import threading

from .models import FaqEntry, Message

logger = logging.getLogger(__name__)

MIN_SCORE = 2          # points an FAQ needs before it is used
MAX_ANSWERS = 2        # most FAQs in one reply
CLOSE_RATIO = 0.6      # a second FAQ is added if it scored at least 60% of the best
MAX_BOT_REPLIES = 5    # most automatic replies on one inquiry

FOOTER = (
    "A member of our team will also read your message and follow up if you need more help. "
    "You can reply here anytime."
)

DEFAULT_FAQS = [
    {
        'question': 'How do I request a roof assessment?',
        'keywords': 'roof assessment, roof check, roof visit, site visit, schedule, request, assessment, inspect, inspection, ipa-check, bisita',
        'answer': (
            'Create a free account on our website, then open New Request and fill in your '
            'details, your roof location and your monthly electric bill. Our team will assign a '
            'Partner Installer who visits your roof on the date we set with you.'
        ),
        'sort_order': 10,
    },
    {
        'question': 'What happens during the roof assessment?',
        'keywords': 'what happens, during assessment, partner installer, installer, measure, measurement, sukat, usable area, suitability, how assessment',
        'answer': (
            'Our Partner Installer visits your property, marks the roof on a map, and records the '
            'tilt, direction and shade. The system then works out your usable roof area, a '
            'suitability score and the recommended system size. You can read the full result '
            'after Staff and Admin review it.'
        ),
        'sort_order': 20,
    },
    {
        'question': 'What solar packages do you offer?',
        'keywords': 'package, packages, kw, kilowatt, size, 3kw, 6kw, 8kw, 10kw, offer, available, solar panel, solar panels, magkano package',
        'answer': (
            'We offer 3KW, 6KW, 8KW and 10KW packages, in On-Grid or Hybrid systems. The right size '
            'depends on your roof and your electric bill. Our team sends you a quotation, and the '
            'roof assessment confirms the best package for your home.'
        ),
        'sort_order': 30,
    },
    {
        'question': 'How much does it cost?',
        'keywords': 'price, prices, cost, how much, magkano, presyo, quotation, quote, estimate, rate, pricing, gastos',
        'answer': (
            'The cost depends on the package and your roof. After your inquiry, our team sends an '
            'initial quotation by email. The final price is confirmed after the roof assessment.'
        ),
        'sort_order': 40,
    },
    {
        'question': 'What is the difference between On-Grid and Hybrid?',
        'keywords': 'on grid, on-grid, ongrid, hybrid, battery, off grid, brownout, blackout, difference, kaibahan, power outage',
        'answer': (
            'An On-Grid system works together with your electric company and has no battery. A Hybrid '
            'system also has a battery, so it can keep supplying power during a power outage. '
            'Hybrid costs more because of the battery.'
        ),
        'sort_order': 50,
    },
    {
        'question': 'How do I track my request?',
        'keywords': 'track, tracking, status, progress, update, where is my request, nasaan, my request, request status',
        'answer': (
            'Sign in to your account and open Request Status. You can follow your request step by step, '
            'and you will get a notification when something changes.'
        ),
        'sort_order': 60,
    },
    {
        'question': 'How do payments work?',
        'keywords': 'payment, payments, pay, downpayment, down payment, installment, hulugan, terms, payment terms, bayad',
        'answer': (
            'The payment terms are written in your quotation. You can see them again in your account '
            'under Documents once your request is approved.'
        ),
        'sort_order': 70,
    },
    {
        'question': 'I forgot my password or cannot sign in.',
        'keywords': 'forgot password, password, cannot sign in, cant login, cannot login, login problem, locked, reset password, nakalimutan',
        'answer': (
            'On the sign-in page, choose Forgot password and follow the steps. If your account is '
            'locked after too many wrong tries, please wait 15 minutes and try again.'
        ),
        'sort_order': 80,
    },
]


# ---------- Matching ----------

def _normalize(text):
    text = re.sub(r'[^a-z0-9]+', ' ', str(text or '').lower())
    return ' '.join(text.split())


def _words(norm):
    """Every word in the message, plus its singular form (panels -> panel)."""
    words = set(norm.split())
    for w in list(words):
        if len(w) > 3 and w.endswith('s'):
            words.add(w[:-1])
    return words


def _keywords(entry):
    seen = []
    for raw in re.split(r'[,\n]+', entry.keywords or ''):
        kw = _normalize(raw)
        if kw and kw not in seen:
            seen.append(kw)
    return seen


def score_entry(entry, norm, words):
    padded = f' {norm} '
    score = 0
    for kw in _keywords(entry):
        if ' ' in kw:
            if f' {kw} ' in padded:
                score += 2
        elif kw in words:
            score += 1
    return score


def find_answers(text, entries=None):
    """Returns the FAQ entries that answer this text, best first (maybe empty)."""
    norm = _normalize(text)
    if not norm:
        return []
    words = _words(norm)
    if entries is None:
        entries = FaqEntry.objects.filter(is_active=True)

    scored = []
    for entry in entries:
        score = score_entry(entry, norm, words)
        if score >= MIN_SCORE:
            scored.append((score, entry.sort_order, entry.id, entry))
    if not scored:
        return []

    scored.sort(key=lambda row: (-row[0], row[1], row[2]))
    best = scored[0][0]
    chosen = [row[3] for row in scored if row[0] >= best * CLOSE_RATIO]
    return chosen[:MAX_ANSWERS]


def build_answer_text(entries):
    return '\n\n'.join(f'{e.question}\n{e.answer}' for e in entries)


def answer_question(text):
    """Used by the chat box on the website. Nothing is saved."""
    entries = find_answers(text)
    return {
        'answered': bool(entries),
        'answers': [{'question': e.question, 'answer': e.answer} for e in entries],
    }


# ---------- Automatic reply on an inquiry ----------

def _send_email_later(inquiry, answer_text):
    """Sends the email in the background so the contact form does not wait for it."""
    from .utils import send_bot_reply_email

    def run():
        try:
            send_bot_reply_email(inquiry, answer_text)
        except Exception:
            logger.exception('Could not send the automatic reply email for inquiry %s', inquiry.pk)

    threading.Thread(target=run, daemon=True).start()


def auto_reply(inquiry, text, send_email=False):
    """
    Saves the chatbot's answer in the inquiry thread (as the Glomax
    Assistant) and, for the first reply, emails it with the reply link.
    Returns the saved Message, or None when there was no match. Never raises.
    """
    try:
        used = inquiry.messages.filter(sender_type=Message.SenderType.BOT).count()
        if used >= MAX_BOT_REPLIES:
            return None
        entries = find_answers(text)
        if not entries:
            return None
        body = build_answer_text(entries)
        message = Message.objects.create(
            inquiry=inquiry,
            sender_type=Message.SenderType.BOT,
            content=f'{body}\n\n{FOOTER}',
        )
        if send_email:
            _send_email_later(inquiry, body)
        return message
    except Exception:
        logger.exception('The chatbot could not reply to inquiry %s', getattr(inquiry, 'pk', ''))
        return None