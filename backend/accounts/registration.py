"""
Verified registration.

No account is made when the form is sent. Instead:
  1. /register/start/   checks the form, saves it as a PendingRegistration
                        and sends a code to the EMAIL only.
  2. /register/verify/  the customer types the email code first. Only when
                        it is right do we send the text message code (so no
                        text credits are spent on a fake email). When the
                        phone code is right too, the real account is made.
  3. /register/resend/  sends a new code (with a wait between sends).

Fake or unreachable emails and numbers can never finish step 2, so they
never become accounts.
"""
import logging
import socket
from types import SimpleNamespace

from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from .models import PendingRegistration, User
from .security import audit
from .serializers import make_customer_username
from .sms import SmsError, mask_phone, normalize_ph_mobile, send_otp_sms
from .two_factor import clean_code, is_six_digits, mask_email, send_code_email

logger = logging.getLogger(__name__)

RESEND_WAIT = {'email': 30, 'phone': 60}

# Free throw-away email services. Their inboxes are public or vanish in
# minutes, so they are not a real way to reach a customer.
DISPOSABLE_DOMAINS = {
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamailblock.com',
    'sharklasers.com', 'grr.la', 'spam4.me', '10minutemail.com', '10minutemail.net',
    'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempail.com', 'tempr.email',
    'yopmail.com', 'yopmail.net', 'trashmail.com', 'getnada.com', 'nada.email',
    'throwawaymail.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com',
    'mailnesia.com', 'mintemail.com', 'spambox.us', 'tempinbox.com', 'emailondeck.com',
    'mohmal.com', 'moakt.com', 'tmail.ws', 'burnermail.io', 'mytemp.email',
    'discard.email', 'mailcatch.com', 'inboxkitten.com', 'harakirimail.com',
    'fexpost.com', 'mailtemp.net', 'tmpmail.org', 'tmpmail.net', 'emailfake.com',
    'fakemail.net', 'mail.tm', 'dropmail.me', 'minuteinbox.com',
}


# Common spelling mistakes in the email domain, and what the customer meant.
DOMAIN_TYPOS = {
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
    'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmaill.com': 'gmail.com',
    'gnail.com': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmal.com': 'gmail.com',
    'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
    'yahho.com': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
    'hotmai.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
    'icloud.con': 'icloud.com', 'icoud.com': 'icloud.com',
}


def domain_can_receive_mail(domain):
    """
    True if this domain can receive email (it has a mail server, or at
    least an address). False only when the domain clearly does not exist.
    If the lookup itself fails (slow DNS, no internet), we say True, so a
    problem on our side never blocks a real customer.
    """
    try:
        import dns.exception
        import dns.resolver
    except ImportError:
        dns = None

    if dns is not None:
        resolver = dns.resolver.Resolver()
        resolver.lifetime = 4
        found_nothing = 0
        for record in ('MX', 'A', 'AAAA'):
            try:
                resolver.resolve(domain, record)
                return True
            except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
                found_nothing += 1
            except dns.resolver.NoNameservers:
                return True
            except dns.exception.DNSException:
                return True
        return found_nothing < 3

    # dnspython is not installed: fall back to a simple address lookup
    try:
        socket.getaddrinfo(domain, None)
        return True
    except socket.gaierror as err:
        return err.errno not in (socket.EAI_NONAME,)
    except OSError:
        return True


# ---------- Rate limits (per internet address) ----------

class _IpThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class RegisterStartThrottle(_IpThrottle):
    scope = 'glomax_register_start'
    rate = '10/hour'


class RegisterVerifyThrottle(_IpThrottle):
    scope = 'glomax_register_verify'
    rate = '60/hour'


class RegisterResendThrottle(_IpThrottle):
    scope = 'glomax_register_resend'
    rate = '20/hour'


# ---------- The form ----------

class RegisterStartSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    email = serializers.EmailField(max_length=150)
    phone_number = serializers.CharField(max_length=30)
    address = serializers.CharField(max_length=255)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    def validate_full_name(self, value):
        value = ' '.join(value.split())
        if len(value) < 2:
            raise serializers.ValidationError('Please enter your full name.')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        domain = value.rsplit('@', 1)[-1]
        if domain in DISPOSABLE_DOMAINS:
            raise serializers.ValidationError('Please use a real email address. Temporary email services are not allowed.')
        if domain in DOMAIN_TYPOS:
            raise serializers.ValidationError(f'Did you mean {value.rsplit("@", 1)[0]}@{DOMAIN_TYPOS[domain]}? Please check the spelling.')
        if '.' not in domain or not domain_can_receive_mail(domain):
            raise serializers.ValidationError('This email address cannot receive mail. Please check the spelling or use another email.')
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists. Please sign in instead.')
        return value

    def validate_phone_number(self, value):
        number = normalize_ph_mobile(value)
        if not number:
            raise serializers.ValidationError('Enter a valid Philippine mobile number, like 09171234567.')
        # Compare the last 10 digits, because old accounts may have saved it as +63... or 09...
        if User.objects.filter(phone_number__endswith=number[-10:]).exists():
            raise serializers.ValidationError('This mobile number is already used by another account.')
        return number

    def validate_address(self, value):
        value = ' '.join(value.split())
        if len(value) < 5:
            raise serializers.ValidationError('Please enter your full address.')
        return value

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({'confirm_password': 'Passwords do not match.'})
        return data


# ---------- Sending the codes ----------

def _send_email_code(pending, code):
    person = SimpleNamespace(full_name=pending.full_name, username='', email=pending.email)
    send_code_email(
        person,
        code,
        subject='Your Glomax verification code',
        heading='Verify Your Email',
        intro='Thanks for signing up with Glomax Solar. Use this code to confirm your email address.',
        minutes=PendingRegistration.CODE_MINUTES,
    )


def _send_phone_code(pending, code):
    send_otp_sms(pending.phone_number, code, PendingRegistration.CODE_MINUTES)


def _send(pending, channel):
    """Makes a new code for one channel and sends it. Raises if it can't be sent."""
    code = PendingRegistration.generate_code()
    if channel == 'email':
        _send_email_code(pending, code)
    else:
        _send_phone_code(pending, code)
    pending.set_code(channel, code)


def _status(pending):
    return {
        'registration_token': pending.token,
        'email_hint': mask_email(pending.email),
        'phone_hint': mask_phone(pending.phone_number),
        'email_verified': pending.email_verified,
        'phone_verified': pending.phone_verified,
        'phone_sent': bool(pending.phone_sent_at),
        'resend_wait': RESEND_WAIT,
        'code_minutes': PendingRegistration.CODE_MINUTES,
    }


def _get_open(token):
    """Returns (pending, None) or (None, error response)."""
    pending = PendingRegistration.objects.filter(token=str(token or '')).first()
    if not pending or pending.is_used:
        return None, Response({'detail': 'This sign-up is no longer valid. Please fill in the form again.', 'restart': True}, status=400)
    if pending.is_expired():
        return None, Response({'detail': 'This sign-up expired. Please fill in the form again.', 'restart': True}, status=400)
    if pending.is_locked():
        return None, Response({'detail': 'Too many wrong codes. Please fill in the form again.', 'restart': True}, status=400)
    return pending, None


def _wrong_code(pending, label):
    """Counts a wrong code and builds the error response."""
    pending.attempts += 1
    pending.save()
    left = max(0, PendingRegistration.MAX_ATTEMPTS - pending.attempts)
    if left == 0:
        return Response({'detail': 'Too many wrong codes. Please fill in the form again.', 'restart': True}, status=400)
    body = _status(pending)
    body['detail'] = f'The {label} code is wrong or has expired. {left} {"try" if left == 1 else "tries"} left.'
    body['wrong'] = [label]
    return Response(body, status=400)


def _need(pending, message):
    body = _status(pending)
    body['detail'] = message
    return Response(body, status=400)


# ---------- Views ----------

class RegisterStartView(APIView):
    """POST /api/accounts/register/start/  - checks the form and sends both codes."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [RegisterStartThrottle]

    def post(self, request):
        serializer = RegisterStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        # Starting again with the same email replaces the older unfinished try
        PendingRegistration.objects.filter(email__iexact=d['email'], is_used=False).delete()

        pending = PendingRegistration(
            token=PendingRegistration.generate_token(),
            full_name=d['full_name'],
            email=d['email'],
            phone_number=d['phone_number'],
            address=d['address'],
            password_hash=make_password(d['password']),
            ip_address=(request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
                        or request.META.get('REMOTE_ADDR', ''))[:64],
        )

        # Only the email code goes out now. The text message is sent after
        # the email code is right, so a fake email costs no SMS credits.
        try:
            _send(pending, 'email')
        except Exception:
            logger.exception('Could not send the sign-up email code to %s', pending.email)
            return Response(
                {'detail': "We couldn't send the code to your email. Please check the email address and try again.",
                 'email': "We couldn't send a code to this email."},
                status=400,
            )

        pending.save()
        audit('REGISTER_STARTED', request, identifier=pending.email, detail='Code sent to email.')
        return Response(_status(pending), status=201)


class RegisterVerifyView(APIView):
    """
    POST /api/accounts/register/verify/
    Body: { registration_token, email_code, phone_code }
    Either code can be sent first. When both are right the account is made.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [RegisterVerifyThrottle]

    def post(self, request):
        pending, error = _get_open(request.data.get('registration_token'))
        if error:
            return error

        email_code = clean_code(request.data.get('email_code'))
        phone_code = clean_code(request.data.get('phone_code'))

        # Step 1: the email code. The text message is only sent after this is right.
        if not pending.email_verified:
            if not email_code:
                return _need(pending, 'Please enter the code from your email.')
            if not (is_six_digits(email_code) and pending.check_code('email', email_code)):
                return _wrong_code(pending, 'email')

            pending.email_verified = True
            pending.save()
            try:
                _send(pending, 'phone')
            except Exception:
                logger.exception('Could not send the sign-up text to %s', mask_phone(pending.phone_number))
                pending.save()
                return _need(
                    pending,
                    "Your email is confirmed, but we couldn't send a text to your mobile number. Please tap Send again.",
                )
            pending.save()
            body = _status(pending)
            body['detail'] = 'Email confirmed. We sent a code to your phone.'
            body['next'] = 'phone'
            return Response(body)

        # Step 2: the phone code
        if not pending.phone_verified:
            if not pending.phone_sent_at:
                return _need(pending, "We haven't sent the text yet. Please tap Send again.")
            if not phone_code:
                return _need(pending, 'Please enter the code from your text message.')
            if not (is_six_digits(phone_code) and pending.check_code('phone', phone_code)):
                return _wrong_code(pending, 'phone')
            pending.phone_verified = True
            pending.save()

        with transaction.atomic():
            pending = PendingRegistration.objects.select_for_update().get(pk=pending.pk)
            if pending.is_used:
                return Response({'detail': 'This account was already created. Please sign in.', 'restart': True}, status=400)
            if User.objects.filter(email__iexact=pending.email).exists():
                return Response({'detail': 'An account with this email already exists. Please sign in instead.', 'restart': True}, status=400)

            user = User.objects.create_user(
                username=make_customer_username(pending.email),
                full_name=pending.full_name,
                email=pending.email,
                phone_number=pending.phone_number,
                address=pending.address,
                role=User.Role.CUSTOMER,  # public registration is always a Customer
            )
            user.password = pending.password_hash  # already hashed
            user.save(update_fields=['password'])
            pending.is_used = True
            pending.save(update_fields=['is_used'])

        audit('REGISTERED', request, user=user, identifier=user.email, detail='Account created after email and phone were verified.')
        return Response({'detail': 'Your account is ready. You can sign in now.', 'registered': True}, status=201)


class RegisterResendView(APIView):
    """
    POST /api/accounts/register/resend/
    Body: { registration_token, channel: "email" | "phone" }
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [RegisterResendThrottle]

    def post(self, request):
        from django.utils import timezone

        pending, error = _get_open(request.data.get('registration_token'))
        if error:
            return error

        channel = str(request.data.get('channel') or '').strip().lower()
        if channel not in ('email', 'phone'):
            return Response({'detail': 'Choose email or phone.'}, status=400)
        if getattr(pending, f'{channel}_verified'):
            return Response({'detail': f'Your {channel} is already verified.'}, status=400)
        if channel == 'phone' and not pending.email_verified:
            return Response({'detail': 'Please confirm your email code first. We text you after that.'}, status=400)
        if getattr(pending, f'{channel}_sends') >= PendingRegistration.MAX_SENDS:
            return Response({'detail': 'Too many codes were sent. Please fill in the form again.', 'restart': True}, status=400)

        sent_at = getattr(pending, f'{channel}_sent_at')
        if sent_at:
            wait = RESEND_WAIT[channel] - int((timezone.now() - sent_at).total_seconds())
            if wait > 0:
                return Response({'detail': f'Please wait {wait} seconds before asking for a new code.', 'wait_seconds': wait}, status=429)

        try:
            _send(pending, channel)
        except Exception:
            logger.exception('Could not resend the sign-up %s code', channel)
            return Response({'detail': "We couldn't send the code right now. Please try again in a moment."}, status=503)

        pending.save()
        body = _status(pending)
        body['detail'] = 'A new code was sent.'
        return Response(body)