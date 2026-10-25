"""
Two-factor login (2FA) helpers.

The flow in plain words:
  1. The user signs in (password or Google).
  2. Instead of getting tokens right away, they get a short-lived
     "challenge token" (see LoginChallenge in models.py).
  3. If they already set up 2FA, they type the 6-digit code we sent by
     text message (SMS) or email (or a backup code).
     If they haven't set it up yet, they pick a method and set it up.
  4. Only when the code is right do they get their access/refresh tokens.
  5. If they ticked "Remember this device", that browser gets a token
     (TrustedDevice). Next time they sign in on it, step 3 is skipped -
     no new code is needed. This makes it easier for people who sign
     in often, or who closed the system by mistake.

Text messages are sent through Semaphore (see sms.py).
"""
import logging
import os
from datetime import timedelta
from email.mime.image import MIMEImage

from django.conf import settings
from django.contrib.auth.models import update_last_login
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone
from rest_framework.response import Response

from .models import User, LoginChallenge, BackupCode, TrustedDevice
from .sms import mask_phone, normalize_ph_mobile, send_otp_sms

logger = logging.getLogger(__name__)

# If someone types the wrong code on this many login screens within
# LOCKOUT_MINUTES, they have to wait before trying again.
LOCKOUT_LIMIT = 3
LOCKOUT_MINUTES = 15

# How long to wait before another code can be sent. Text messages cost
# Semaphore credits, so they wait a little longer than emails.
RESEND_WAIT_SECONDS = {
    User.TwoFactorMethod.EMAIL: 30,
    User.TwoFactorMethod.SMS: 60,
}

VALID_METHODS = (User.TwoFactorMethod.SMS, User.TwoFactorMethod.EMAIL)


# ---------- Small helpers ----------

def mask_email(email):
    """juan.delacruz@gmail.com -> ju***********@gmail.com"""
    if not email or '@' not in email:
        return ''
    name, domain = email.split('@', 1)
    shown = name[:2] if len(name) > 2 else name[:1]
    return f"{shown}{'*' * max(len(name) - len(shown), 3)}@{domain}"


def clean_code(code):
    return str(code or '').strip().replace(' ', '')


def is_six_digits(code):
    return len(code) == 6 and code.isdigit()


def issue_tokens(user):
    """
    Creates the real access/refresh tokens. Same response shape as the
    old login endpoint, so the rest of the frontend keeps working.
    """
    # Local import avoids a circular import (serializers imports models)
    from .serializers import GlomaxTokenObtainPairSerializer

    refresh = GlomaxTokenObtainPairSerializer.get_token(user)
    refresh['role'] = user.role
    refresh['username'] = user.username
    update_last_login(None, user)

    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
        'role': user.role,
        'username': user.username,
        'user_id': user.id,
    }


def backup_codes_left(user):
    return BackupCode.objects.filter(user=user, used_at__isnull=True).count()


def contact_hints(user):
    """The masked email and phone the frontend can show ("We'll text 0917***4567")."""
    phone = user.two_factor_phone or user.phone_number
    return {
        'email_hint': mask_email(user.email),
        'has_email': bool(user.email),
        'phone_hint': mask_phone(phone),
        'has_phone': bool(normalize_ph_mobile(phone)),
    }


def challenge_method(challenge):
    """Which method this screen sends codes with (SMS or EMAIL)."""
    if challenge.purpose == LoginChallenge.Purpose.SETUP:
        return challenge.pending_method
    return challenge.user.two_factor_method


def challenge_phone(challenge):
    """Where an SMS code for this screen goes."""
    if challenge.purpose == LoginChallenge.Purpose.SETUP:
        return challenge.pending_phone
    return challenge.user.two_factor_phone


def sent_to_hint(challenge):
    """What the "We sent a code to ..." line should say."""
    if challenge_method(challenge) == User.TwoFactorMethod.SMS:
        return {'phone_hint': mask_phone(challenge_phone(challenge))}
    return {'email_hint': mask_email(challenge.user.email)}


# ---------- Email ----------

def send_code_email(user, code, subject, heading, intro, minutes):
    """
    Sends a 6-digit code in the same Glomax email design used for the
    password change code. Raises an exception if the email can't be
    sent, so the caller can show a clear message.
    """
    plain_message = (
        f'Your verification code is {code}. It expires in {minutes} minutes. '
        f"If you didn't request this, you can safely ignore this email."
    )

    html_message = f"""
    <div style="background-color:#f3f4f6;padding:32px 16px;font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background-color:#0d1f3c;padding:20px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="cid:glomax_logo" width="32" height="32" style="display:block;border-radius:6px;" />
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:17px;font-weight:bold;">Glomax Solar Enterprises</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 12px;color:#0d1f3c;font-size:20px;">{heading}</h2>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              {intro}
            </p>
            <div style="text-align:center;margin:0 0 24px;">
              <span style="display:inline-block;background-color:#fef9c3;border:1.5px solid #eab308;border-radius:10px;padding:16px 32px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0d1f3c;">
                {code}
              </span>
            </div>
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
              This code will expire in <strong>{minutes} minutes</strong>.
            </p>
            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #f1f3f6;">
            <p style="margin:0;color:#9ca3af;font-size:11.5px;">
              This is an automated message from Glomax Solar Enterprises. Please do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </div>
    """

    email = EmailMultiAlternatives(
        subject=subject,
        body=plain_message,
        from_email=None,  # uses DEFAULT_FROM_EMAIL
        to=[user.email],
    )
    email.attach_alternative(html_message, "text/html")

    logo_path = os.path.join(settings.BASE_DIR, 'finalsheet', 'static', 'finalsheet', 'logo.jpg')
    try:
        with open(logo_path, 'rb') as f:
            logo_image = MIMEImage(f.read())
            logo_image.add_header('Content-ID', '<glomax_logo>')
            logo_image.add_header('Content-Disposition', 'inline', filename='logo.jpg')
            email.attach(logo_image)
    except FileNotFoundError:
        pass  # email still sends fine without the logo

    email.send()


# ---------- Sending a code (SMS or email) ----------

def send_login_code(challenge):
    """
    Makes a new 6-digit code for this challenge and sends it by SMS or
    email, depending on the method. Returns True if it went out, False
    if it failed (the real error is written to the server terminal).
    """
    method = challenge_method(challenge)
    code = LoginChallenge.generate_code()
    challenge.set_code(code)
    challenge.save(update_fields=['code_hash', 'code_sent_at', 'codes_sent'])

    is_setup = challenge.purpose == LoginChallenge.Purpose.SETUP
    try:
        if method == User.TwoFactorMethod.SMS:
            send_otp_sms(challenge_phone(challenge), code, minutes=LoginChallenge.CODE_MINUTES)
        else:
            send_code_email(
                challenge.user,
                code,
                subject='Your Glomax verification code',
                heading='Confirm your email for 2-step login' if is_setup else 'Your sign-in code',
                intro=(
                    'Use the code below to finish turning on 2-step login for your account.'
                    if is_setup else
                    'Someone (hopefully you) just signed in to your Glomax account. Use the code below to finish signing in.'
                ),
                minutes=LoginChallenge.CODE_MINUTES,
            )
        return True
    except Exception:
        logger.exception("Could not send 2FA code (%s) to user %s", method, challenge.user_id)
        return False


def send_failed_message(method):
    if method == User.TwoFactorMethod.SMS:
        return "We couldn't send the text message right now. Please try again in a moment, or use your backup codes."
    return "We couldn't send the code to your email right now. Please try again in a moment, or use your backup codes."


def can_resend(challenge):
    """
    Returns how many seconds to wait before another code can be sent
    (0 = ok to send now).
    """
    if not challenge.code_sent_at:
        return 0
    wait = RESEND_WAIT_SECONDS.get(challenge_method(challenge), 30)
    passed = (timezone.now() - challenge.code_sent_at).total_seconds()
    return max(0, int(wait - passed))


def too_many_sends(challenge):
    return challenge.codes_sent >= LoginChallenge.MAX_SENDS


# ---------- Login challenge ----------

def is_temporarily_locked(user):
    since = timezone.now() - timedelta(minutes=LOCKOUT_MINUTES)
    locked_count = LoginChallenge.objects.filter(
        user=user,
        created_at__gte=since,
        attempts__gte=LoginChallenge.MAX_ATTEMPTS,
    ).count()
    return locked_count >= LOCKOUT_LIMIT


# ---------- Remembered devices ----------

def device_label(request):
    """A short, readable name for the browser, e.g. "Chrome on Windows"."""
    agent = (request.META.get('HTTP_USER_AGENT') or '') if request else ''
    browser = next((name for key, name in (
        ('Edg', 'Edge'), ('OPR', 'Opera'), ('Chrome', 'Chrome'), ('Firefox', 'Firefox'), ('Safari', 'Safari'),
    ) if key in agent), 'Browser')
    system = next((name for key, name in (
        ('Android', 'Android'), ('iPhone', 'iPhone'), ('iPad', 'iPad'), ('Windows', 'Windows'),
        ('Mac OS', 'Mac'), ('Linux', 'Linux'),
    ) if key in agent), '')
    return f"{browser} on {system}" if system else browser


def remember_device(user, request):
    """Remembers this browser after a correct code. Returns the token for the browser to keep."""
    return TrustedDevice.remember(user, device_label(request))


def forget_devices(user):
    """Every remembered browser of this user will need a code again."""
    TrustedDevice.objects.filter(user=user).delete()


def trusted_device_sign_in(user, tokens):
    """
    If this browser is remembered for this user, signs them in right
    away (no code). Returns the response, or None if a code is needed.
    """
    if not user.two_factor_enabled or user.two_factor_method not in VALID_METHODS:
        return None
    device = TrustedDevice.find_valid(user, tokens)
    if not device:
        return None
    device.touch()
    data = issue_tokens(user)
    data['trusted_device'] = True
    return Response(data)


def start_login_challenge(user, trusted_tokens=None):
    """
    Called right after the password (or Google sign-in) is accepted.
    Returns the response the login page should get.

    trusted_tokens: the remembered-device tokens this browser sent. If
    one is valid for this user, they're signed in without a code.
    """
    if is_temporarily_locked(user):
        return Response(
            {"detail": f"Too many wrong codes. Please wait {LOCKOUT_MINUTES} minutes and try again."},
            status=429,
        )

    remembered = trusted_device_sign_in(user, trusted_tokens)
    if remembered:
        return remembered

    # Accounts that used the old Authenticator App (removed) - or that
    # somehow have no valid method - set up 2FA again with SMS or email.
    if user.two_factor_enabled and user.two_factor_method not in VALID_METHODS:
        reset_two_factor(user)

    # Old open screens for this user stop working once a new one starts
    LoginChallenge.objects.filter(user=user, is_used=False).exclude(
        attempts__gte=LoginChallenge.MAX_ATTEMPTS
    ).update(is_used=True)

    purpose = (
        LoginChallenge.Purpose.VERIFY if user.two_factor_enabled
        else LoginChallenge.Purpose.SETUP
    )
    challenge = LoginChallenge.objects.create(
        user=user,
        token=LoginChallenge.generate_token(),
        purpose=purpose,
    )

    data = {
        'two_factor': 'verify' if purpose == LoginChallenge.Purpose.VERIFY else 'setup',
        'challenge_token': challenge.token,
        'method': user.two_factor_method if user.two_factor_enabled else '',
        'role': user.role,
        'username': user.username,
        'expires_in': LoginChallenge.LIFETIME_MINUTES * 60,
        'resend_wait': RESEND_WAIT_SECONDS.get(user.two_factor_method, 30),
        **contact_hints(user),
    }

    # Already set up: send the code straight away
    if purpose == LoginChallenge.Purpose.VERIFY:
        data['code_sent'] = send_login_code(challenge)
        if not data['code_sent']:
            data['send_error'] = send_failed_message(user.two_factor_method)

    return Response(data)


def get_open_challenge(token, purpose):
    """
    Finds the challenge for this token. Returns (challenge, None) if it
    can still be used, or (None, error_response) if not.
    """
    if not token:
        return None, Response({"detail": "Your sign-in session is missing. Please sign in again."}, status=400)

    challenge = LoginChallenge.objects.select_related('user').filter(token=token, purpose=purpose).first()
    if not challenge or challenge.is_used:
        return None, Response({"detail": "This sign-in session is no longer valid. Please sign in again."}, status=400)
    if challenge.is_expired():
        return None, Response({"detail": "This sign-in session has expired. Please sign in again.", "expired": True}, status=400)
    if challenge.is_locked():
        return None, Response({"detail": "Too many wrong codes. Please sign in again.", "locked": True}, status=400)
    if not challenge.user.is_active:
        return None, Response({"detail": "This account is deactivated."}, status=403)
    return challenge, None


def wrong_code_response(challenge, message='Incorrect code. Please try again.'):
    challenge.attempts += 1
    challenge.save(update_fields=['attempts'])
    left = LoginChallenge.MAX_ATTEMPTS - challenge.attempts
    if left <= 0:
        return Response({"detail": "Too many wrong codes. Please sign in again.", "locked": True}, status=400)
    return Response(
        {"detail": f"{message} {left} {'try' if left == 1 else 'tries'} left.", "attempts_left": left},
        status=400,
    )


def resend_code(challenge):
    """
    Sends a new code on an open sign-in or setup screen. Used by the
    "Resend code" button. Returns the response to send back.
    """
    method = challenge_method(challenge)
    if method not in VALID_METHODS:
        return Response({"detail": "Please choose a method first."}, status=400)

    wait = can_resend(challenge)
    if wait:
        return Response({"detail": f"Please wait {wait} seconds before asking for a new code.", "wait": wait}, status=429)

    if too_many_sends(challenge):
        return Response(
            {"detail": "You've asked for too many codes. Please sign in again, or use one of your backup codes."},
            status=429,
        )

    challenge.created_at = timezone.now()  # give them a fresh 10 minutes
    challenge.save(update_fields=['created_at'])

    if not send_login_code(challenge):
        return Response({"detail": send_failed_message(method)}, status=503)

    return Response({
        "detail": "A new code has been sent.",
        "resend_wait": RESEND_WAIT_SECONDS.get(method, 30),
        **sent_to_hint(challenge),
    })


# ---------- Setup (first time, or changing method) ----------

def begin_setup(challenge, method, phone=None):
    """
    Step 1 of setup. Sends a code by SMS or email so the user can prove
    it reaches them.
    For SMS, 'phone' is the number typed on the setup screen. If it's
    empty, the number saved on the account is used.
    """
    user = challenge.user

    if method not in VALID_METHODS:
        return Response({"detail": "Please choose Text Message (SMS) or Email."}, status=400)

    # Choosing a method restarts the timer and the code counter
    challenge.created_at = timezone.now()
    challenge.pending_method = method
    challenge.pending_phone = ''
    challenge.code_hash = ''
    challenge.code_sent_at = None
    challenge.codes_sent = 0

    if method == User.TwoFactorMethod.SMS:
        number = normalize_ph_mobile(phone or user.phone_number)
        if not number:
            challenge.save()
            return Response(
                {
                    "detail": "Please enter a valid mobile number (11 digits, starts with 09).",
                    "needs_phone": True,
                },
                status=400,
            )
        challenge.pending_phone = number
        challenge.save()
        if not send_login_code(challenge):
            return Response(
                {"detail": "We couldn't send the text message right now. Please check the number and try again, or use Email."},
                status=503,
            )
        return Response({
            'method': method,
            'phone_hint': mask_phone(number),
            'expires_in': LoginChallenge.LIFETIME_MINUTES * 60,
            'resend_wait': RESEND_WAIT_SECONDS[method],
        })

    # EMAIL
    if not user.email:
        challenge.save()
        return Response(
            {"detail": "Your account has no email address. Please use Text Message (SMS) instead."},
            status=400,
        )

    challenge.save()
    if not send_login_code(challenge):
        return Response(
            {"detail": "We couldn't send the code to your email right now. Please try again, or use Text Message (SMS)."},
            status=503,
        )
    return Response({
        'method': method,
        'email_hint': mask_email(user.email),
        'expires_in': LoginChallenge.LIFETIME_MINUTES * 60,
        'resend_wait': RESEND_WAIT_SECONDS[method],
    })


def finish_setup(challenge, code):
    """
    Step 2 of setup. Checks the code that was sent.
    Returns (backup_codes, None) on success or (None, error_response).
    """
    code = clean_code(code)
    method = challenge.pending_method

    if method not in VALID_METHODS:
        return None, Response({"detail": "Please choose a method first."}, status=400)
    if not is_six_digits(code):
        return None, Response({"detail": "Please enter the 6-digit code."}, status=400)

    if not challenge.check_code(code):
        return None, wrong_code_response(challenge)

    user = challenge.user
    user.two_factor_enabled = True
    user.two_factor_method = method
    user.two_factor_enabled_at = timezone.now()
    fields = ['two_factor_enabled', 'two_factor_method', 'two_factor_phone', 'two_factor_enabled_at']

    if method == User.TwoFactorMethod.SMS:
        user.two_factor_phone = challenge.pending_phone
        # If the account had no phone number yet, save the checked one
        if not normalize_ph_mobile(user.phone_number):
            user.phone_number = challenge.pending_phone
            fields.append('phone_number')
    else:
        user.two_factor_phone = ''

    user.save(update_fields=fields)

    challenge.is_used = True
    challenge.save(update_fields=['is_used'])

    return BackupCode.create_new_set(user), None


def check_login_code(challenge, code):
    """
    Checks a code typed on the login screen. Accepts the 6-digit code
    (SMS or email) or a backup code. Returns (ok, used_backup_code).
    """
    user = challenge.user
    code = clean_code(code)

    if is_six_digits(code):
        return challenge.check_code(code), False

    if BackupCode.use_code(user, code):
        return True, True
    return False, False


def reset_two_factor(user):
    """Turns 2FA off for a user. They will set it up again on their next sign-in."""
    user.two_factor_enabled = False
    user.two_factor_method = ''
    user.two_factor_phone = ''
    user.two_factor_enabled_at = None
    user.save(update_fields=['two_factor_enabled', 'two_factor_method', 'two_factor_phone', 'two_factor_enabled_at'])
    BackupCode.objects.filter(user=user).delete()
    LoginChallenge.objects.filter(user=user, is_used=False).update(is_used=True)
    forget_devices(user)