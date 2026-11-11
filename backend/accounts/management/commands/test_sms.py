"""
Quick check that text messages (SMS) are set up and working.
Use it before a demo, so you do not have to type anything in the shell.

Usage (in the backend folder, with your virtual environment on):
    python manage.py test_sms 09XXXXXXXXX

Use a number that belongs to ANOTHER phone, not the phone that runs
the SMS app.

It shows:
  1. Which SMS provider is chosen (SMS_PROVIDER) and if its settings are filled in.
  2. If ticket SMS is on (SMS_NOTIFICATIONS_ENABLED).
  3. The result of sending one test text.

Then look at the SMS app on the phone. The message should show as Sent.
"""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.sms import (
    SmsError,
    gateway_is_configured,
    get_provider,
    mask_phone,
    normalize_ph_mobile,
    send_gateway_sms,
)


class Command(BaseCommand):
    help = "Sends one test text message and shows if SMS is set up correctly."

    def add_arguments(self, parser):
        parser.add_argument('number', type=str, help='Mobile number, for example 09171234567')

    def handle(self, *args, **options):
        number = normalize_ph_mobile(options['number'])
        if not number:
            raise CommandError('That is not a valid mobile number. Use a real one like 09171234567.')

        provider = get_provider()
        self.stdout.write(f'Provider (SMS_PROVIDER): {provider}')

        if provider == 'semaphore':
            self.stdout.write(self.style.WARNING(
                'Semaphore is chosen. This test only checks TextBee and SMSGate. '
                'Set SMS_PROVIDER=smsgate (or textbee) to test those.'
            ))
            return

        if not gateway_is_configured(provider):
            if provider == 'smsgate':
                raise CommandError('SMSGATE_USERNAME and SMSGATE_PASSWORD are not set in .env.')
            raise CommandError('TEXTBEE_API_KEY is not set in .env.')
        self.stdout.write(self.style.SUCCESS('Settings are filled in.'))

        enabled = getattr(settings, 'SMS_NOTIFICATIONS_ENABLED', False)
        if enabled:
            self.stdout.write(self.style.SUCCESS('Ticket SMS is ON (SMS_NOTIFICATIONS_ENABLED=True).'))
        else:
            self.stdout.write(self.style.WARNING(
                'Ticket SMS is OFF. Login codes still work, but ticket updates are only written '
                'in the log. Set SMS_NOTIFICATIONS_ENABLED=True to turn them on.'
            ))

        self.stdout.write(f'Sending a test text to {mask_phone(number)} ...')
        try:
            send_gateway_sms(number, 'Test from Glomax')
        except SmsError as exc:
            raise CommandError(f'Not sent: {exc}')

        self.stdout.write(self.style.SUCCESS(
            'The SMS service accepted the text.\n'
            'Now check the phone. In the SMS app, the message should show Sent.\n'
            'If it shows Failed, the SIM on that phone cannot send texts '
            '(no signal, no regular load, or not registered).'
        ))