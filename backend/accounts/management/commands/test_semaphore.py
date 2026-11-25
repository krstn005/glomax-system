"""
Checks that Semaphore is set up right. Safe to run: by default it only
READS your account (credits and sender names) and sends nothing.

    python manage.py test_semaphore
    python manage.py test_semaphore --number 09171234567 --send

With --send it texts a test code to that number, the same way the
sign-up and sign-in codes are sent. That uses real credits.
"""
import requests
from django.conf import settings
from django.core.management.base import BaseCommand

from accounts.sms import SmsError, normalize_ph_mobile, send_otp_sms

ACCOUNT_URL = 'https://api.semaphore.co/api/v4/account'
SENDERNAMES_URL = 'https://api.semaphore.co/api/v4/sendernames'


class Command(BaseCommand):
    help = 'Check the Semaphore settings, and optionally send one test code.'

    def add_arguments(self, parser):
        parser.add_argument('--number', help='Your mobile number, like 09171234567')
        parser.add_argument('--send', action='store_true', help='Really send a test code (uses credits)')

    def handle(self, *args, **options):
        out = self.stdout.write

        key = getattr(settings, 'SEMAPHORE_API_KEY', '')
        if not key:
            out(self.style.ERROR('SEMAPHORE_API_KEY is empty. Add it to your .env file (or the Render Environment page).'))
            return
        out(f'SEMAPHORE_API_KEY is set ({len(key)} characters).')

        sender = getattr(settings, 'SEMAPHORE_SENDER_NAME', '')
        out(f'SEMAPHORE_SENDER_NAME is: {sender or "(empty - Semaphore will use its default sender)"}')
        out(f'SMS_NOTIFICATIONS_ENABLED is: {getattr(settings, "SMS_NOTIFICATIONS_ENABLED", False)} '
            '(only for ticket texts - sign-in and sign-up codes are always sent)')

        # 1. Account: is the key valid, and how many credits are left?
        try:
            res = requests.get(ACCOUNT_URL, params={'apikey': key}, timeout=15)
        except requests.RequestException as exc:
            out(self.style.ERROR(f'Could not reach Semaphore: {exc}'))
            return
        throttled = res.status_code == 429
        if throttled:
            out(self.style.WARNING(
                'Semaphore says "Too Many Attempts" for the account check. This is a short limit, '
                'not a wrong key. Skipping the credits check.'
            ))
        elif res.status_code in (401, 403):
            out(self.style.ERROR(f'Semaphore said {res.status_code}: {res.text[:200]}'))
            out('The API key is probably wrong. Copy it again from your Semaphore account.')
            return
        elif res.status_code != 200:
            out(self.style.ERROR(f'Semaphore said {res.status_code}: {res.text[:200]}'))
            return
        else:
            info = res.json()
            out(self.style.SUCCESS(
                f'Key works. Account: {info.get("account_name", "?")}, status: {info.get("status", "?")}, '
                f'credits left: {info.get("credit_balance", "?")}'
            ))

        # 2. Sender names
        try:
            if throttled:
                raise RuntimeError('skip')
            names = requests.get(SENDERNAMES_URL, params={'apikey': key}, timeout=15).json()
            if isinstance(names, list) and names:
                out('Sender names on your account: ' + ', '.join(
                    f'{n.get("name")} ({n.get("status", "?")})' for n in names
                ))
                if sender and sender not in [n.get('name') for n in names]:
                    out(self.style.WARNING(f'"{sender}" is not on your account list. Texts may be refused.'))
            else:
                out('No custom sender names on this account. Leave SEMAPHORE_SENDER_NAME empty.')
        except Exception:
            out('Could not read the sender names (not a problem).')

        # 3. Optional: send one test code
        if not options['send']:
            out('Nothing was sent. To send a test code: python manage.py test_semaphore --number 09XXXXXXXXX --send')
            return
        number = normalize_ph_mobile(options.get('number'))
        if not number:
            out(self.style.ERROR('Please give a valid Philippine mobile number with --number, like 09171234567.'))
            return
        try:
            send_otp_sms(number, '123456', 5)
        except SmsError as exc:
            out(self.style.ERROR(f'The test code was NOT sent: {exc}'))
            return
        out(self.style.SUCCESS(f'Test code sent to {number}. Check your phone (it may take a few seconds).'))