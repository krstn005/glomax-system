"""
Forgot password, by text message.

  1. /password-reset/start/    the customer types their email or mobile
                               number. If an account matches, we text a
                               6-digit code to its mobile number (or email
                               it, when there is no mobile number).
  2. /password-reset/confirm/  the customer types the code and a new
                               password. Only a right code changes it.
  3. /password-reset/resend/   sends a new code (with a wait between sends).

The answers are always the same whether or not an account matches, so
nobody can use this page to find out who has an account.
Staff, Partner Installer and Admin accounts are not reset here. Their
passwords are reset by the Admin (Workers page).
"""
import logging
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from .models import PasswordResetRequest, User
from .password_setup import password_problem
from .security import audit
from .sms import normalize_ph_mobile, send_otp_sms
from .two_factor import clean_code, forget_devices, is_six_digits, send_code_email

logger = logging.getLogger(__name__)

RESEND_WAIT_SECONDS = 60
MAX_REQUESTS_PER_HOUR = 5

START_MESSAGE = (
    'If an account matches, we sent a 6-digit code to its mobile number '
    '(or to its email if there is no number).'
)
BAD_CODE_MESSAGE = 'That code is wrong or has expired. Please check it, or ask for a new code.'


class _IpThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class ResetStartThrottle(_IpThrottle):
    scope = 'glomax_reset_start'
    rate = '10/hour'


class ResetConfirmThrottle(_IpThrottle):
    scope = 'glomax_reset_confirm'
    rate = '30/hour'


class ResetResendThrottle(_IpThrottle):
    scope = 'glomax_reset_resend'
    rate = '10/hour'


def _client_ip(request):
    return (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', ''))[:64]


def _find_user(identifier):
    """The one active Customer that matches this email or mobile number, or None."""
    text = (identifier or '').strip()
    if not text:
        return None
    customers = User.objects.filter(role=User.Role.CUSTOMER, is_active=True)
    if '@' in text:
        matches = list(customers.filter(email__iexact=text)[:2])
    else:
        number = normalize_ph_mobile(text)
        if not number:
            return None
        matches = list(customers.filter(phone_number__endswith=number[-10:])[:2])
    return matches[0] if len(matches) == 1 else None


def _send_code(reset):
    """Makes a new code and sends it. Returns True if it went out."""
    user = reset.user
    code = PasswordResetRequest.generate_code()
    sent_by = ''

    phone = normalize_ph_mobile(user.two_factor_phone or '') or normalize_ph_mobile(user.phone_number or '')
    if phone:
        try:
            send_otp_sms(phone, code, PasswordResetRequest.CODE_MINUTES)
            sent_by = 'SMS'
        except Exception:
            logger.exception('Could not send the password reset text to user %s', user.id)

    if not sent_by and user.email:
        try:
            send_code_email(
                user,
                code,
                subject='Your Glomax password reset code',
                heading='Reset Your Password',
                intro='We received a request to reset your Glomax password. Use the code below to choose a new one.',
                minutes=PasswordResetRequest.CODE_MINUTES,
            )
            sent_by = 'EMAIL'
        except Exception:
            logger.exception('Could not send the password reset email to user %s', user.id)

    if not sent_by:
        return False
    reset.set_code(code)
    reset.sent_by = sent_by
    reset.save()
    return True


class PasswordResetStartView(APIView):
    """POST /api/accounts/password-reset/start/  Body: { identifier }"""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ResetStartThrottle]

    def post(self, request):
        identifier = str(request.data.get('identifier') or '').strip()[:150]
        user = _find_user(identifier)
        token = PasswordResetRequest.generate_token()  # a made-up token if there is no account

        if user:
            now = timezone.now()
            recent = PasswordResetRequest.objects.filter(user=user, created_at__gte=now - timedelta(hours=1))
            latest = recent.order_by('-created_at').first()
            waiting = bool(latest and latest.code_sent_at and (now - latest.code_sent_at).total_seconds() < RESEND_WAIT_SECONDS)

            if waiting and latest.is_open():
                token = latest.token
            elif recent.count() < MAX_REQUESTS_PER_HOUR:
                PasswordResetRequest.objects.filter(user=user, is_used=False).update(is_used=True)
                reset = PasswordResetRequest(user=user, token=token, ip_address=_client_ip(request))
                if _send_code(reset):
                    audit('PASSWORD_RESET_ASKED', request, user=user, identifier=identifier,
                          detail='Reset code sent by ' + ('text message.' if reset.sent_by == 'SMS' else 'email.'))

        return Response({
            'reset_token': token,
            'resend_wait': RESEND_WAIT_SECONDS,
            'code_minutes': PasswordResetRequest.CODE_MINUTES,
            'detail': START_MESSAGE,
        })


class PasswordResetConfirmView(APIView):
    """POST /api/accounts/password-reset/confirm/  Body: { reset_token, code, new_password, confirm_password }"""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ResetConfirmThrottle]

    def post(self, request):
        new_password = request.data.get('new_password') or ''
        confirm = request.data.get('confirm_password') or ''
        code = clean_code(request.data.get('code'))

        reset = PasswordResetRequest.objects.select_related('user').filter(
            token=str(request.data.get('reset_token') or '')
        ).first()
        user = reset.user if reset else None

        # Password rules first, so a weak password never uses up a try
        if new_password != confirm:
            return Response({'detail': 'Passwords do not match.', 'field': 'confirm_password'}, status=400)
        try:
            validate_password(new_password, user)
        except DjangoValidationError as err:
            return Response({'detail': err.messages[0], 'field': 'new_password'}, status=400)
        issue = password_problem(new_password, user) if user else None
        if issue:
            return Response({'detail': issue, 'field': 'new_password'}, status=400)
        if not is_six_digits(code):
            return Response({'detail': 'Please type the 6-digit code.', 'field': 'code'}, status=400)

        # Same answer for a wrong, expired, used or unknown request
        if not reset or not reset.is_open():
            return Response({'detail': BAD_CODE_MESSAGE, 'field': 'code'}, status=400)
        if not reset.check_code(code):
            reset.attempts += 1
            reset.save(update_fields=['attempts'])
            return Response({'detail': BAD_CODE_MESSAGE, 'field': 'code'}, status=400)

        user.set_password(new_password)
        user.save()
        reset.is_used = True
        reset.save(update_fields=['is_used'])
        PasswordResetRequest.objects.filter(user=user, is_used=False).update(is_used=True)
        # New password: every remembered browser asks for a code again
        forget_devices(user)
        audit('PASSWORD_RESET_DONE', request, user=user, identifier=user.email or user.username,
              detail='Password changed with a reset code.')

        return Response({'detail': 'Your password was changed. You can sign in now.'})


class PasswordResetResendView(APIView):
    """POST /api/accounts/password-reset/resend/  Body: { reset_token }"""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ResetResendThrottle]

    def post(self, request):
        reset = PasswordResetRequest.objects.select_related('user').filter(
            token=str(request.data.get('reset_token') or '')
        ).first()

        if reset and reset.is_open() and reset.sends < PasswordResetRequest.MAX_SENDS:
            waited = (timezone.now() - reset.code_sent_at).total_seconds() if reset.code_sent_at else RESEND_WAIT_SECONDS
            if waited >= RESEND_WAIT_SECONDS:
                _send_code(reset)

        return Response({'resend_wait': RESEND_WAIT_SECONDS, 'detail': 'If the request is still open, we sent a new code.'})