"""
Sends text messages (SMS) for Glomax.

Two providers are supported. Choose one with SMS_PROVIDER in the .env
file (or in the Render Environment settings):

  SMS_PROVIDER=textbee     (default) TextBee, an Android phone that
                           works as an SMS gateway. https://textbee.dev
  SMS_PROVIDER=semaphore   Semaphore, a Philippine SMS provider.
                           https://semaphore.co/docs

TextBee settings:
  TEXTBEE_API_KEY    - the API key from your TextBee dashboard
  TEXTBEE_DEVICE_ID  - optional. Only needed if you linked more than
                       one phone. Leave it empty to use your default phone.

Semaphore settings:
  SEMAPHORE_API_KEY      - from your Semaphore account
  SEMAPHORE_SENDER_NAME  - optional, your approved sender name

Notes about TextBee:
  - The phone with the TextBee app must be on and online. The text is
    sent from that phone's SIM.
  - The free plan allows 50 texts per day and 300 per month.
  - "Queued" does not mean "delivered". TextBee accepts the text first,
    then the phone sends it.

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
TEXTBEE_SEND_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms'


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


def to_international(number):
    """09171234567 -> +639171234567 (the format TextBee needs). '' if invalid."""
    number = normalize_ph_mobile(number)
    if not number:
        return ''
    return '+63' + number[1:]


def mask_phone(number):
    """09171234567 -> 0917***4567"""
    number = normalize_ph_mobile(number)
    if not number:
        return ''
    return f"{number[:4]}***{number[-4:]}"


def get_provider():
    """Returns 'textbee' or 'semaphore'. TextBee is the default."""
    provider = str(getattr(settings, 'SMS_PROVIDER', 'textbee') or 'textbee').strip().lower()
    return provider if provider in ('textbee', 'semaphore') else 'textbee'


def send_textbee(number, message):
    """
    Sends one text through TextBee. `number` can be typed in any common
    Philippine format. Raises SmsError if TextBee did not accept it.

    A good answer only means TextBee queued the text. The phone sends
    it a moment later.
    """
    international = to_international(number)
    if not international:
        raise SmsError('Invalid mobile number.')

    api_key = getattr(settings, 'TEXTBEE_API_KEY', '')
    if not api_key:
        raise SmsError('TEXTBEE_API_KEY is not set.')

    payload = {
        'recipients': [international],
        'message': message,
    }
    device_id = getattr(settings, 'TEXTBEE_DEVICE_ID', '')
    if device_id:
        payload['deviceId'] = device_id

    try:
        response = requests.post(
            TEXTBEE_SEND_URL,
            json=payload,
            headers={'x-api-key': api_key},
            timeout=15,
        )
    except requests.RequestException as exc:
        raise SmsError(f'Could not reach TextBee: {exc}') from exc

    if response.status_code == 429:
        raise SmsError('TextBee limit reached (free plan: 50 per day, 300 per month).')
    if response.status_code != 200:
        raise SmsError(f'TextBee error {response.status_code}: {response.text[:300]}')

    # A good reply looks like: {"data": {"success": true, "message": "SMS added to queue ..."}}
    try:
        result = response.json()
    except ValueError as exc:
        raise SmsError(f'Unexpected reply from TextBee: {response.text[:300]}') from exc

    data = result.get('data', result) if isinstance(result, dict) else {}
    if isinstance(data, dict) and data.get('success') is False:
        raise SmsError(f'TextBee did not accept the message: {data}')


def send_otp_sms(number, code, minutes):
    """
    Sends the 6-digit code to the mobile number. Raises SmsError if it
    could not be sent, so the caller can show a clear message.
    """
    number = normalize_ph_mobile(number)
    if not number:
        raise SmsError('Invalid mobile number.')

    provider = get_provider()

    if provider == 'textbee':
        if not getattr(settings, 'TEXTBEE_API_KEY', ''):
            if settings.DEBUG:
                # Local testing only: show the code in the terminal
                print(f"\n[SMS not sent - no TEXTBEE_API_KEY] Code for {number}: {code}\n")
                return
            raise SmsError('TEXTBEE_API_KEY is not set.')

        message = (
            f'Your Glomax Solar code is {code}. It expires in '
            f'{minutes} minutes. Never share this code with anyone.'
        )
        send_textbee(number, message)
        logger.info("2FA code sent by SMS to %s (TextBee, queued)", mask_phone(number))
        return

    # ---------- Semaphore ----------
    # Note: Semaphore ignores any message that starts with "TEST".
    # Semaphore fills in {otp} with the code we send below.
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