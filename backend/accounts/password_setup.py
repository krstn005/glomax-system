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
import re
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.utils.crypto import salted_hmac

from glomax_backend.email_design import build_email, button, details, p, small

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
    Emails the one-time link to the worker, in the shared Glomax email
    design. Raises an error if the email can't be sent, so the caller
    can show a clear message.
    """
    link = build_setup_link(user)
    name = (user.full_name or '').strip() or user.username

    blocks = [
        p(f'Hi {name},'),
        p(
            'The Glomax Admin asked you to set your own password. Press the button below '
            'and choose a password that only you know.'
        ),
        details([('Your username', user.username)]),
        button('Set My Password', link, 'gold'),
        small(f'This link can be used once and expires in {LINK_HOURS} hours.'),
        small('If the button does not work, copy this address into your browser:'),
        small(link),
        small('If you did not expect this email, you can ignore it.'),
    ]
    build_email('Set your Glomax password', user.email, 'Set your password', blocks).send()