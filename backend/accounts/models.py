from django.contrib.auth.models import AbstractUser
from django.contrib.auth.hashers import make_password, check_password
from django.conf import settings
from django.db import models
import hashlib
import hmac
import secrets
from django.utils import timezone
from datetime import timedelta


class User(AbstractUser):
    """
    Custom user model that adds a 'role' field on top of Django's
    built-in user fields (username, password, email, etc.)
    """

    class Role(models.TextChoices):
        CUSTOMER = 'CUSTOMER', 'Customer'
        STAFF = 'STAFF', 'Staff'
        PARTNER_INSTALLER = 'PARTNER_INSTALLER', 'Partner Installer'
        ADMIN = 'ADMIN', 'Administrator'

    class TwoFactorMethod(models.TextChoices):
        SMS = 'SMS', 'Text Message (SMS)'
        EMAIL = 'EMAIL', 'Email Code'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CUSTOMER,
    )

    # Extra fields based on your Figma screens (phone number appears
    # on Register, Settings, and Manage Staff/Partner Installer pages)
    phone_number = models.CharField(max_length=20, blank=True)
    full_name = models.CharField(max_length=150, blank=True)

    # From the Customer Register Page — property address
    address = models.CharField(max_length=255, blank=True)

    # From Admin Settings > Manage Staff / Manage Partner Installer —
    # accounts can be deactivated/reactivated by the Admin
    is_active_account = models.BooleanField(default=True)

    # Profile photo, shown in the sidebar/header avatar once uploaded.
    # Falls back to initials on the frontend if this is empty.
    profile_picture = models.ImageField(
        upload_to='profile_pictures/',
        blank=True,
        null=True,
    )

    # Notification Preferences (Customer Settings > Notifications tab)
    notify_email_updates = models.BooleanField(default=True)
    notify_sms_updates = models.BooleanField(default=True)
    notify_request_approval = models.BooleanField(default=True)
    notify_request_rejection = models.BooleanField(default=True)
    notify_promotions = models.BooleanField(default=False)

    # ----- Two-factor login (2FA) -----
    # 2FA is required for every account. Until two_factor_enabled is
    # True, the user is asked to set it up right after their password
    # is accepted.
    two_factor_enabled = models.BooleanField(default=False)
    two_factor_method = models.CharField(
        max_length=10,
        choices=TwoFactorMethod.choices,
        blank=True,
    )
    # The mobile number that was proven to work during SMS setup. Codes
    # are sent here, not to phone_number, so changing the number in
    # My Profile can't quietly move sign-in codes to an unchecked phone.
    two_factor_phone = models.CharField(max_length=20, blank=True)
    two_factor_enabled_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.username} ({self.role})"


class PasswordChangeOTP(models.Model):
    """
    One-time 6-digit code emailed to a user before their password
    change actually takes effect (2FA on the Security & Password
    card). A user can have multiple rows over time, but only ever one
    *unused, unexpired* one at a time - requesting a new code deletes
    any old unused ones for that user first (see the view).
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_change_otps')
    code = models.CharField(max_length=6)
    new_password = models.CharField(max_length=128)  # hashed before saving - see the view
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    def is_expired(self):
        return timezone.now() > self.created_at + timedelta(minutes=10)

    @staticmethod
    def generate_code():
        return ''.join(secrets.choice('0123456789') for _ in range(6))


class LoginChallenge(models.Model):
    """
    Created after the password (or Google sign-in) is accepted, but
    BEFORE the real login tokens are given out. The frontend gets only
    the random 'token' below, then sends it back together with the
    6-digit code. Only when the code is right does the user get their
    access/refresh tokens.

    purpose:
      VERIFY - the user already has 2FA, they just need to enter a code
      SETUP  - the user has no 2FA yet (or is changing it), they must
               set it up first
    """

    class Purpose(models.TextChoices):
        VERIFY = 'VERIFY', 'Verify'
        SETUP = 'SETUP', 'Setup'

    # How long the whole "enter your code" screen stays valid. Choosing
    # a method or resending a code restarts this timer.
    LIFETIME_MINUTES = 10
    # How long one code works (email or SMS)
    CODE_MINUTES = 5
    MAX_ATTEMPTS = 5
    # Most codes one sign-in screen can send. Protects the SMS credits.
    MAX_SENDS = 5

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='login_challenges')
    token = models.CharField(max_length=64, unique=True)
    purpose = models.CharField(max_length=10, choices=Purpose.choices)

    # The code that was sent (by email or SMS). We keep a hashed copy
    # only, never the plain code.
    code_hash = models.CharField(max_length=128, blank=True)
    code_sent_at = models.DateTimeField(null=True, blank=True)
    codes_sent = models.PositiveSmallIntegerField(default=0)

    # During SETUP, the chosen method (and for SMS, the mobile number)
    # waits here until the user proves it works by typing a correct code.
    pending_method = models.CharField(max_length=10, blank=True)
    pending_phone = models.CharField(max_length=20, blank=True)

    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() > self.created_at + timedelta(minutes=self.LIFETIME_MINUTES)

    def is_locked(self):
        return self.attempts >= self.MAX_ATTEMPTS

    def is_valid(self):
        return not self.is_used and not self.is_expired() and not self.is_locked()

    def set_code(self, code):
        self.code_hash = make_password(code)
        self.code_sent_at = timezone.now()
        self.codes_sent += 1

    def check_code(self, code):
        if not self.code_hash or not self.code_sent_at:
            return False
        if timezone.now() > self.code_sent_at + timedelta(minutes=self.CODE_MINUTES):
            return False
        return check_password(code, self.code_hash)

    @staticmethod
    def generate_token():
        return secrets.token_urlsafe(32)

    @staticmethod
    def generate_code():
        return ''.join(secrets.choice('0123456789') for _ in range(6))

    def __str__(self):
        return f"{self.user.username} - {self.purpose} ({'used' if self.is_used else 'open'})"


class BackupCode(models.Model):
    """
    One-time backup codes, used when the user loses their phone or
    can't get their email or text message. Each code works only once. Saved hashed
    (scrambled with the project's SECRET_KEY), never as plain text.
    """
    COUNT = 8

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='backup_codes')
    code_hash = models.CharField(max_length=128)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @staticmethod
    def generate_plain_code():
        # Looks like: 4F7K-9Q2M (easy to read, no 0/O or 1/I mix-ups)
        alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        raw = ''.join(secrets.choice(alphabet) for _ in range(8))
        return f"{raw[:4]}-{raw[4:]}"

    @staticmethod
    def hash_code(code):
        # Fast but safe: without the SECRET_KEY nobody can turn the
        # saved hash back into the code.
        return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()

    @classmethod
    def create_new_set(cls, user):
        """Deletes the user's old codes and returns a list of new plain codes."""
        cls.objects.filter(user=user).delete()
        plain_codes = [cls.generate_plain_code() for _ in range(cls.COUNT)]
        cls.objects.bulk_create([
            cls(user=user, code_hash=cls.hash_code(code)) for code in plain_codes
        ])
        return plain_codes

    @classmethod
    def use_code(cls, user, entered_code):
        """Returns True and marks the code used if it matches an unused one."""
        cleaned = entered_code.strip().upper().replace(' ', '').replace('-', '')
        if len(cleaned) != 8:
            return False
        cleaned = f"{cleaned[:4]}-{cleaned[4:]}"
        backup = cls.objects.filter(
            user=user, used_at__isnull=True, code_hash=cls.hash_code(cleaned)
        ).first()
        if not backup:
            return False
        backup.used_at = timezone.now()
        backup.save(update_fields=['used_at'])
        return True

    def __str__(self):
        return f"{self.user.username} backup code ({'used' if self.used_at else 'unused'})"


class TrustedDevice(models.Model):
    """
    A browser that already passed 2-step login ("Remember this device").
    While it's remembered, signing in on it again only needs the
    password (or Google) - no new code.

    Only a hash of the token is saved here. The real token stays in that
    browser. Every time the device is used, it stays remembered for
    another LIFETIME_DAYS, so people who use the system often are
    almost never asked for a code again.
    """
    LIFETIME_DAYS = getattr(settings, 'TRUSTED_DEVICE_DAYS', 30)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='trusted_devices',
    )
    token_hash = models.CharField(max_length=64, unique=True)
    # Short browser description, e.g. "Chrome on Windows" (for Settings later)
    label = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()

    @staticmethod
    def hash_token(token):
        return hmac.new(settings.SECRET_KEY.encode(), str(token).encode(), hashlib.sha256).hexdigest()

    @classmethod
    def remember(cls, user, label=''):
        """Saves a new remembered device and returns its plain token (shown to the browser once)."""
        token = secrets.token_urlsafe(32)
        cls.objects.create(
            user=user,
            token_hash=cls.hash_token(token),
            label=label[:120],
            expires_at=timezone.now() + timedelta(days=cls.LIFETIME_DAYS),
        )
        # Keep only the 10 newest devices per account
        old_ids = list(
            cls.objects.filter(user=user).order_by('-last_used_at').values_list('id', flat=True)[10:]
        )
        if old_ids:
            cls.objects.filter(id__in=old_ids).delete()
        return token

    @classmethod
    def find_valid(cls, user, tokens):
        """Returns this user's remembered device for one of these tokens, or None."""
        if not tokens:
            return None
        if isinstance(tokens, str):
            tokens = [tokens]
        hashes = [cls.hash_token(t) for t in tokens[:10] if isinstance(t, str) and 20 <= len(t) <= 100]
        if not hashes:
            return None
        return cls.objects.filter(
            user=user, token_hash__in=hashes, expires_at__gt=timezone.now()
        ).first()

    def touch(self):
        """Used again: remember it for another LIFETIME_DAYS."""
        now = timezone.now()
        self.last_used_at = now
        self.expires_at = now + timedelta(days=self.LIFETIME_DAYS)
        self.save(update_fields=['last_used_at', 'expires_at'])

    def __str__(self):
        return f"{self.user.username} remembered device ({self.label or 'browser'})"