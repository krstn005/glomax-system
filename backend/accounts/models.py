from django.contrib.auth.models import AbstractUser
from django.db import models
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