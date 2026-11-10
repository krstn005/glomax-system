"""
Sends the saved SMS templates (Admin > Settings > SMS Templates) to
customers. The text is sent through TextBee (default) or Semaphore,
whichever SMS_PROVIDER is set to (see accounts/sms.py).

How it works:
  1. Each template name starts with a number, like "06 - Installer Assigned".
     The code finds the template by that number, so Admin can change the
     words, but should keep the number at the start of the name.
  2. The blanks like {customer_name} are filled in.
  3. The text is sent to the customer's phone number.

Safe by default:
  - Nothing is really sent until SMS_NOTIFICATIONS_ENABLED=True is set
    (in .env, or in the Render Environment settings). While it is off,
    the text is only written in the server log, so you can see what
    would have been sent.
  - An SMS that fails never breaks the request, approval or ticket
    update. It is only logged.
  - Customers who turned off SMS Updates in their Settings get no text.
"""

import json
import logging
import re
import threading
from urllib import parse, request as urlrequest

from django.conf import settings

from accounts.sms import SmsError, get_provider, send_textbee

logger = logging.getLogger(__name__)

SEMAPHORE_URL = 'https://api.semaphore.co/api/v4/messages'


def clean_number(raw):
    """
    Turns a Philippine mobile number into the 09XXXXXXXXX form.
    Accepts 0917..., 63917..., +63917... and 917... Returns None if
    the number does not look right.
    """
    digits = re.sub(r'\D', '', raw or '')
    if digits.startswith('63') and len(digits) == 12:
        digits = '0' + digits[2:]
    elif len(digits) == 10 and digits.startswith('9'):
        digits = '0' + digits
    if len(digits) == 11 and digits.startswith('09'):
        return digits
    return None


def fill_template(text, values):
    """Fills {blanks} in the text. A blank with no value becomes empty."""
    filled = re.sub(r'\{(\w+)\}', lambda m: str(values.get(m.group(1), '')), text or '')
    return re.sub(r' {2,}', ' ', filled).strip()


def _post_to_semaphore(number, message):
    data = {
        'apikey': settings.SEMAPHORE_API_KEY,
        'number': number,
        'message': message,
    }
    sender = getattr(settings, 'SEMAPHORE_SENDER_NAME', '')
    if sender:
        data['sendername'] = sender

    req = urlrequest.Request(
        SEMAPHORE_URL,
        data=parse.urlencode(data).encode('utf-8'),
        method='POST',
    )
    try:
        with urlrequest.urlopen(req, timeout=15) as response:
            body = response.read().decode('utf-8', 'replace')
        # Semaphore answers with a list of sent messages. An error comes
        # back as a dictionary instead.
        parsed = json.loads(body)
        if isinstance(parsed, dict):
            logger.error('Semaphore did not send the SMS to %s: %s', number, body[:200])
    except Exception:
        logger.exception('Could not send the SMS to %s', number)


def _post_to_textbee(number, message):
    """Runs in the background. Never raises, only logs."""
    try:
        send_textbee(number, message)
    except SmsError as exc:
        logger.error('TextBee did not send the SMS to %s: %s', number, exc)
    except Exception:
        logger.exception('Could not send the SMS to %s', number)


def send_sms(number, message, label=''):
    """
    Sends one text. Returns True if it was sent (or queued to send), or
    written to the log while SMS is off. Returns False if skipped.
    Never raises.
    """
    try:
        cleaned = clean_number(number)
        if not cleaned:
            logger.info('SMS "%s" skipped: no valid phone number.', label)
            return False
        if not message:
            return False

        if not getattr(settings, 'SMS_NOTIFICATIONS_ENABLED', False):
            logger.warning('[SMS OFF - not sent] %s -> %s: %s', label, cleaned, message)
            return True

        if get_provider() == 'textbee':
            if not getattr(settings, 'TEXTBEE_API_KEY', ''):
                logger.warning('SMS "%s" skipped: TEXTBEE_API_KEY is not set.', label)
                return False
            target = _post_to_textbee
        else:
            if not getattr(settings, 'SEMAPHORE_API_KEY', ''):
                logger.warning('SMS "%s" skipped: SEMAPHORE_API_KEY is not set.', label)
                return False
            target = _post_to_semaphore

        # Send in the background, so the page does not wait for the provider
        threading.Thread(
            target=target, args=(cleaned, message), daemon=True
        ).start()
        return True
    except Exception:
        logger.exception('SMS "%s" failed.', label)
        return False


def send_template_sms(code, number, values, user=None, pref=None):
    """
    Finds the active template whose name starts with `code` (for
    example '06'), fills it in, and sends it.

    user  - the customer, so their SMS settings are respected
    pref  - an extra setting on the user to also respect, for example
            'notify_request_approval'
    """
    try:
        if user is not None:
            if not getattr(user, 'notify_sms_updates', True):
                return False
            if pref and not getattr(user, pref, True):
                return False

        from .models import SmsTemplate

        template = SmsTemplate.objects.filter(
            is_active=True, name__startswith=f'{code} '
        ).first()
        if not template:
            logger.info('No active SMS template starts with "%s" - nothing sent.', code)
            return False

        message = fill_template(template.message, values)
        return send_sms(number, message, label=template.name)
    except Exception:
        logger.exception('SMS template %s failed.', code)
        return False


def _first_name(name):
    word = (name or '').strip().split(' ')[0]
    return word[:1].upper() + word[1:]


def _date_text(value):
    try:
        return value.strftime('%B %d, %Y') if value else ''
    except Exception:
        return ''


def send_ticket_sms(ticket, code, pref=None, **extra):
    """
    Sends a template to the customer of a ticket. The number used is the
    contact number on the request, or the number on the customer's
    account if the request has none.

    extra can add or replace values, for example new_visit_date='...'.
    """
    try:
        customer = ticket.customer
        if not customer:
            return False

        number = (getattr(ticket, 'contact_number', '') or '').strip() or customer.phone_number
        full_name = (
            (getattr(ticket, 'full_name', '') or '').strip()
            or (customer.get_full_name() or '').strip()
            or (getattr(customer, 'full_name', '') or '').strip()
            or customer.username
        )
        portal = getattr(settings, 'CUSTOMER_PORTAL_URL', '').rstrip('/')

        values = {
            'customer_name': _first_name(full_name),
            'ticket_number': ticket.ticket_number,
            'visit_date': _date_text(ticket.visit_date),
            'status': ticket.get_status_display() if hasattr(ticket, 'get_status_display') else '',
            'link': f'{portal}/request-status',
        }
        values.update(extra)

        return send_template_sms(code, number, values, user=customer, pref=pref)
    except Exception:
        logger.exception('SMS for ticket %s failed.', getattr(ticket, 'ticket_number', ''))
        return False