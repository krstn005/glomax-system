"""
Sends text messages (SMS) through Semaphore, a Philippine SMS provider.
https://semaphore.co/docs

We use Semaphore's OTP route (/api/v4/otp). It is made for codes like
ours: it uses a faster priority lane and is not rate limited. We send
our own 6-digit code with it, so the code we save is the code the user
receives.

Settings needed (put them in the .env file):
  SEMAPHORE_API_KEY      - from your Semaphore account
  SEMAPHORE_SENDER_NAME  - optional, your approved sender name
                           (leave empty to use Semaphore's default)

While testing on your own computer (DEBUG = True) without an API key,
the code is printed in the Django terminal instead of being sent, so
you can still sign in without spending credits.
"""
import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

SEMAPHORE_OTP_URL = 'https://api.semaphore.co/api/v4/otp'


class SmsError(Exception):
    """Raised when a text message could not be sent."""


def normalize_ph_mobile(number):
    """
    Turns the common ways people type a Philippine mobile number into
    one format: 09XXXXXXXXX (11 digits). Returns '' if it isn't a
    valid mobile number.
      0917 123 4567   -> 09171234567
      +63 917 1234567 -> 09171234567
      639171234567    -> 09171234567
      9171234567      -> 09171234567
    """
    digits = re.sub(r'\D', '', str(number or ''))
    if digits.startswith('63') and len(digits) == 12:
        digits = '0' + digits[2:]
    elif digits.startswith('9') and len(digits) == 10:
        digits = '0' + digits
    if re.fullmatch(r'09\d{9}', digits):
        return digits
    return ''


def mask_phone(number):
    """09171234567 -> 0917***4567"""
    number = normalize_ph_mobile(number)
    if not number:
        return ''
    return f"{number[:4]}***{number[-4:]}"


def send_otp_sms(number, code, minutes):
    """
    Sends the 6-digit code to the mobile number. Raises SmsError if it
    could not be sent, so the caller can show a clear message.
    """
    number = normalize_ph_mobile(number)
    if not number:
        raise SmsError('Invalid mobile number.')

    # Note: Semaphore ignores any message that starts with "TEST".
    message = (
        'Your Glomax Solar code is {otp}. It expires in '
        f'{minutes} minutes. Never share this code with anyone.'
    )

    api_key = getattr(settings, 'SEMAPHORE_API_KEY', '')
    if not api_key:
        if settings.DEBUG:
            # Local testing only: show the code in the terminal
            print(f"\n[SMS not sent - no SEMAPHORE_API_KEY] Code for {number}: {code}\n")
            return
        raise SmsError('SEMAPHORE_API_KEY is not set.')

    payload = {
        'apikey': api_key,
        'number': number,
        'message': message,
        'code': code,
    }
    sender_name = getattr(settings, 'SEMAPHORE_SENDER_NAME', '')
    if sender_name:
        payload['sendername'] = sender_name

    try:
        response = requests.post(SEMAPHORE_OTP_URL, data=payload, timeout=15)
    except requests.RequestException as exc:
        raise SmsError(f'Could not reach Semaphore: {exc}') from exc

    if response.status_code != 200:
        raise SmsError(f'Semaphore error {response.status_code}: {response.text[:300]}')

    # A good reply is a list with one message, e.g. [{"status": "Pending", ...}]
    try:
        result = response.json()
    except ValueError as exc:
        raise SmsError(f'Unexpected reply from Semaphore: {response.text[:300]}') from exc

    first = result[0] if isinstance(result, list) and result else result
    status = str((first or {}).get('status', '')).lower() if isinstance(first, dict) else ''
    if status in ('failed', 'refunded'):
        raise SmsError(f'Semaphore could not deliver the message: {first}')

    logger.info("2FA code sent by SMS to %s (status: %s)", mask_phone(number), status or 'unknown')