"""
Password setup link for Staff and Partner Installer accounts.

In plain words:
  - The Admin never types or sees a worker's password.
  - The Admin presses "Send password link". The worker gets an email
    with a one-time link and creates their own password.
  - The link works once and stops working after 24 hours. It also stops
    working as soon as the password is changed by any other way.
  - Nothing is saved in the database for the link. It is a signed
    token (made with the project's SECRET_KEY), so no migration is needed.
"""
import hmac
import os
import re
from email.mime.image import MIMEImage
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives
from django.utils.crypto import salted_hmac
from django.utils.html import escape

from .models import User

SALT = 'glomax.password-setup'
LINK_HOURS = 24
SETUP_ROLES = ['STAFF', 'PARTNER_INSTALLER']

LINK_EXPIRED = 'This link has expired. Please ask the Admin to send you a new one.'
LINK_INVALID = 'This link is not valid, or it was already used. Please ask the Admin to send you a new one.'

MIN_PASSWORD = 8


def _stamp(user):
    # Changes every time the password changes - this is what makes the
    # link work only once.
    return salted_hmac(SALT, f'{user.pk}:{user.password}:{user.is_active}').hexdigest()[:24]


def make_setup_token(user):
    return signing.dumps({'u': user.pk, 's': _stamp(user)}, salt=SALT, compress=True)


def read_setup_token(token):
    """Returns (user, '') if the link is good, or (None, message) if not."""
    if not token or not isinstance(token, str):
        return None, LINK_INVALID
    try:
        data = signing.loads(token, salt=SALT, max_age=LINK_HOURS * 3600)
    except signing.SignatureExpired:
        return None, LINK_EXPIRED
    except signing.BadSignature:
        return None, LINK_INVALID

    user = User.objects.filter(pk=data.get('u'), role__in=SETUP_ROLES, is_active=True).first()
    if not user or not hmac.compare_digest(str(data.get('s', '')), _stamp(user)):
        return None, LINK_INVALID
    return user, ''


def password_problem(password, user=None):
    """
    The same rules as the password checklist on the screen.
    Returns a short sentence about the first problem, or '' if it is fine.
    """
    password = password or ''
    if len(password) < MIN_PASSWORD:
        return f'Password needs at least {MIN_PASSWORD} characters.'
    if not re.search(r'[A-Z]', password):
        return 'Password needs one uppercase letter (A-Z).'
    if not re.search(r'[a-z]', password):
        return 'Password needs one lowercase letter (a-z).'
    if not re.search(r'[0-9]', password):
        return 'Password needs one number (0-9).'
    if not re.search(r'[^A-Za-z0-9\s]', password):
        return 'Password needs one symbol (!@#$%).'
    if re.search(r'\s', password):
        return 'Password cannot have spaces.'
    try:
        validate_password(password, user)
    except ValidationError as err:
        return err.messages[0]
    return ''


def mask_email(email):
    """juan.delacruz@gmail.com -> ju***@gmail.com"""
    if not email or '@' not in email:
        return ''
    name, domain = email.split('@', 1)
    return f'{name[:2]}***@{domain}'


def build_setup_link(user):
    token = quote(make_setup_token(user), safe='')
    return f'{settings.FRONTEND_BASE_URL}/set-password?token={token}'


def send_password_link(user):
    """
    Emails the one-time link to the worker. Raises an error if the email
    can't be sent, so the caller can show a clear message.
    """
    link = build_setup_link(user)
    name = escape(user.full_name or user.username)
    username = escape(user.username)

    plain_message = (
        f'Hi {user.full_name or user.username},\n\n'
        'The Glomax Admin asked you to set your own password.\n\n'
        f'Your username: {user.username}\n\n'
        f'Open this link and choose your password:\n{link}\n\n'
        f'The link can be used once and expires in {LINK_HOURS} hours.\n'
        "If you did not expect this email, you can ignore it.\n\n"
        'Glomax Solar Enterprises'
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
            <h2 style="margin:0 0 12px;color:#0d1f3c;font-size:20px;">Set your password</h2>
            <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.6;">
              Hi {name}, the Glomax Admin asked you to set your own password. Press the button below and choose a password that only you know.
            </p>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              Your username: <strong>{username}</strong>
            </p>
            <div style="text-align:center;margin:0 0 24px;">
              <a href="{link}" style="display:inline-block;background-color:#facc15;color:#0d1f3c;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:10px;">
                Set My Password
              </a>
            </div>
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
              This link can be used <strong>once</strong> and expires in <strong>{LINK_HOURS} hours</strong>.
            </p>
            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
              If the button does not work, copy this address into your browser:<br />
              <span style="word-break:break-all;color:#1e40af;">{link}</span>
            </p>
            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
              If you did not expect this email, you can ignore it.
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
        subject='Set your Glomax password',
        body=plain_message,
        from_email=None,  # uses DEFAULT_FROM_EMAIL
        to=[user.email],
    )
    email.attach_alternative(html_message, 'text/html')

    logo_path = os.path.join(settings.BASE_DIR, 'finalsheet', 'static', 'finalsheet', 'logo.jpg')
    try:
        with open(logo_path, 'rb') as f:
            logo_image = MIMEImage(f.read())
            logo_image.add_header('Content-ID', '<glomax_logo>')
            logo_image.add_header('Content-Disposition', 'inline', filename='logo.jpg')
            email.attach(logo_image)
    except FileNotFoundError:
        pass  # the email still sends fine without the logo

    email.send()