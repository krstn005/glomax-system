"""
Security helpers for sign-in: the audit log, the wrong-password lockout
and limits on how fast one address can try.

Nothing here changes how a normal sign-in works. These views wrap the
existing ones in views.py and add the checks around them.

  - 5 wrong passwords for the same email/username -> locked for 15 minutes
  - every sign-in, failure, lockout and password change is written to
    the audit log (Admin > Audit Log)
"""
import logging
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from .models import AuditLog, LoginChallenge, User
from .views import (
    ChangePasswordView,
    GlomaxLoginView,
    TwoFactorVerifyView,
    VerifyChangePasswordOtpView,
)

logger = logging.getLogger(__name__)

# Wrong passwords allowed before the lock, and how long the lock lasts
LOCK_LIMIT = 5
LOCK_MINUTES = 15


# ---------- Audit log ----------

def client_ip(request):
    """The visitor's address. Behind Cloudflare / Render the real one is in X-Forwarded-For."""
    if request is None:
        return ''
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR', '')
    return (ip or '')[:64]


def audit(action, request=None, user=None, identifier='', detail=''):
    """
    Writes one row to the audit log. Never raises: a problem with the
    log must never break sign-in or registration.
    """
    try:
        AuditLog.objects.create(
            actor=user if (user is not None and getattr(user, 'pk', None)) else None,
            actor_name=((getattr(user, 'full_name', '') or getattr(user, 'username', '')) if user else '')[:150],
            actor_role=(getattr(user, 'role', '') if user else '')[:20],
            action=action[:40],
            detail=str(detail or '')[:300],
            identifier=str(identifier or '').strip().lower()[:150],
            ip_address=client_ip(request),
        )
    except Exception:
        logger.exception('Could not write audit log row for %s', action)


# ---------- Lockout ----------

def canonical_identifier(identifier):
    """
    People can sign in with an email, a username or a full name. All of
    them must count toward the SAME lock, or someone could try 5 times
    with each. So when the text matches an account, use that account's
    username as the key.
    """
    identifier = (identifier or '').strip().lower()
    if not identifier:
        return ''
    user = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
    if not user:
        matches = list(User.objects.filter(full_name__iexact=identifier, is_active=True)[:2])
        user = matches[0] if len(matches) == 1 else None
    return user.username.lower() if user else identifier

def lock_minutes_left(identifier):
    """
    Returns how many minutes are left on the lock for this email or
    username, or 0 if it is not locked. Counts wrong passwords since the
    last correct one, inside the last LOCK_MINUTES.
    """
    identifier = (identifier or '').strip().lower()
    if not identifier:
        return 0
    now = timezone.now()
    since = now - timedelta(minutes=LOCK_MINUTES)

    last_ok = (
        AuditLog.objects.filter(action='LOGIN_PASSWORD_OK', identifier=identifier)
        .order_by('-created_at')
        .values_list('created_at', flat=True)
        .first()
    )
    if last_ok and last_ok > since:
        since = last_ok

    failed = list(
        AuditLog.objects.filter(action='LOGIN_FAILED', identifier=identifier, created_at__gt=since)
        .order_by('created_at')
        .values_list('created_at', flat=True)
    )
    if len(failed) < LOCK_LIMIT:
        return 0

    # The lock started at the 5th wrong try
    unlock_at = failed[LOCK_LIMIT - 1] + timedelta(minutes=LOCK_MINUTES)
    if unlock_at <= now:
        return 0
    return max(1, int((unlock_at - now).total_seconds() // 60) + 1)


class LoginThrottle(SimpleRateThrottle):
    """Most sign-in tries from one internet address per hour."""
    scope = 'glomax_login'
    rate = '60/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


# ---------- Sign-in views (wrap the originals) ----------

class SecureLoginView(GlomaxLoginView):
    """
    POST /api/accounts/login/  - same as before, plus the lockout and
    the audit log.
    """
    throttle_classes = [LoginThrottle]

    def post(self, request):
        identifier = canonical_identifier(str(request.data.get('username') or ''))

        minutes = lock_minutes_left(identifier)
        if minutes:
            audit('LOGIN_BLOCKED', request, identifier=identifier, detail='Sign-in blocked: account is locked.')
            return Response(
                {
                    'detail': f'Too many wrong tries. This account is locked for about {minutes} '
                              f'minute{"s" if minutes != 1 else ""}. Please try again later.',
                    'locked': True,
                    'minutes_left': minutes,
                },
                status=429,
            )

        try:
            response = super().post(request)
        except AuthenticationFailed:
            audit('LOGIN_FAILED', request, identifier=identifier, detail='Wrong email/username or password.')
            if lock_minutes_left(identifier):
                audit(
                    'ACCOUNT_LOCKED', request, identifier=identifier,
                    detail=f'Locked for {LOCK_MINUTES} minutes after {LOCK_LIMIT} wrong passwords.',
                )
            raise

        if response.status_code == 200:
            user = User.objects.filter(username__iexact=identifier).first()
            audit('LOGIN_PASSWORD_OK', request, user=user, identifier=identifier, detail='Password accepted.')
            data = response.data if isinstance(response.data, dict) else {}
            if data.get('access'):
                audit('LOGIN_SUCCESS', request, user=user, identifier=identifier, detail='Signed in (remembered device).')
        return response


class SecureTwoFactorVerifyView(TwoFactorVerifyView):
    """POST /api/accounts/2fa/verify/  - same as before, plus the audit log."""

    def post(self, request):
        challenge = (
            LoginChallenge.objects.select_related('user')
            .filter(token=request.data.get('challenge_token'))
            .first()
        )
        user = challenge.user if challenge else None
        response = super().post(request)
        data = response.data if isinstance(response.data, dict) else {}
        if response.status_code == 200 and data.get('access'):
            detail = 'Signed in with a backup code.' if data.get('used_backup_code') else 'Signed in.'
            audit('LOGIN_SUCCESS', request, user=user, identifier=getattr(user, 'email', ''), detail=detail)
        elif response.status_code >= 400 and user:
            audit('LOGIN_CODE_FAILED', request, user=user, identifier=user.email, detail='Wrong or expired sign-in code.')
        return response


class AuditedChangePasswordView(ChangePasswordView):
    def post(self, request):
        response = super().post(request)
        if response.status_code == 200:
            audit('PASSWORD_CHANGED', request, user=request.user, identifier=request.user.email, detail='Password changed.')
        return response


class AuditedVerifyChangePasswordOtpView(VerifyChangePasswordOtpView):
    def post(self, request):
        response = super().post(request)
        if response.status_code == 200:
            audit('PASSWORD_CHANGED', request, user=request.user, identifier=request.user.email, detail='Password changed (email code).')
        return response


# ---------- Admin: read the audit log ----------

ACTION_LABELS = {
    'REGISTERED': 'Account registered',
    'REGISTER_STARTED': 'Registration started',
    'LOGIN_SUCCESS': 'Signed in',
    'LOGIN_PASSWORD_OK': 'Password accepted',
    'LOGIN_FAILED': 'Wrong password',
    'LOGIN_CODE_FAILED': 'Wrong sign-in code',
    'LOGIN_BLOCKED': 'Sign-in blocked (locked)',
    'ACCOUNT_LOCKED': 'Account locked',
    'PASSWORD_CHANGED': 'Password changed',
}


class AuditLogListView(APIView):
    """
    GET /api/accounts/admin/audit-log/?page=1&action=LOGIN_FAILED&q=juan
    Admin only. Newest first, 25 per page.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    PAGE_SIZE = 25

    def get(self, request):
        qs = AuditLog.objects.all()
        action = (request.query_params.get('action') or '').strip().upper()
        if action:
            qs = qs.filter(action=action)
        q = (request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(identifier__icontains=q) | Q(actor_name__icontains=q)
                | Q(detail__icontains=q) | Q(ip_address__icontains=q)
            )

        try:
            page = max(1, int(request.query_params.get('page') or 1))
        except ValueError:
            page = 1
        count = qs.count()
        start = (page - 1) * self.PAGE_SIZE
        rows = qs[start:start + self.PAGE_SIZE]

        return Response({
            'count': count,
            'page': page,
            'page_size': self.PAGE_SIZE,
            'actions': [{'key': k, 'label': v} for k, v in ACTION_LABELS.items()],
            'results': [
                {
                    'id': r.id,
                    'created_at': r.created_at,
                    'action': r.action,
                    'action_label': ACTION_LABELS.get(r.action, r.action.replace('_', ' ').title()),
                    'who': r.actor_name or r.identifier or '—',
                    'role': r.actor_role,
                    'detail': r.detail,
                    'ip_address': r.ip_address,
                }
                for r in rows
            ],
        })