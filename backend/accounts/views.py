import uuid
import logging

from django.conf import settings
from django.contrib.auth.hashers import make_password
from rest_framework import generics, permissions, status, parsers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from .serializers import (
    RegisterSerializer,
    UserSerializer,
    GlomaxTokenObtainPairSerializer,
    StaffPartnerInstallerCreateSerializer,
    ManagedUserSerializer,
    GoogleLoginSerializer,
    ChangePasswordSerializer,
    AdminSetPasswordSerializer,
    RequestPasswordChangeOtpSerializer,
    VerifyPasswordChangeOtpSerializer,
)
from .models import User, PasswordChangeOTP, LoginChallenge, BackupCode
from .two_factor import (
    send_code_email,
    send_login_code,
    send_failed_message,
    start_login_challenge,
    get_open_challenge,
    wrong_code_response,
    can_resend,
    resend_code,
    begin_setup,
    finish_setup,
    check_login_code,
    clean_code,
    is_six_digits,
    issue_tokens,
    backup_codes_left,
    contact_hints,
    sent_to_hint,
    reset_two_factor,
    remember_device,
    forget_devices,
    RESEND_WAIT_SECONDS,
)
from accounts.permissions import IsAdmin, IsStaff

logger = logging.getLogger(__name__)


# Where each worker role's Settings page lives, so the notification
# opens the right page when clicked.
WORKER_SETTINGS_LINKS = {
    'STAFF': '/staff/settings',
    'PARTNER_INSTALLER': '/partner-installer/settings',
}


def notify_worker_account_change(user, message):
    """
    Sends an in-app notification to a Staff or Partner Installer when
    the Admin changes something about their account (activate,
    deactivate, password reset, or 2FA reset). Uses the WORKER_ACCOUNT
    kind. Local import avoids a circular import between the accounts
    and notifications apps.
    """
    from notifications.models import Notification
    Notification.objects.create(
        recipient=user,
        kind=Notification.Kind.WORKER_ACCOUNT,
        message=message,
        link=WORKER_SETTINGS_LINKS.get(user.role, ''),
    )


class RequestChangePasswordOtpView(APIView):
    """
    POST /api/accounts/change-password/request-otp/  - Step 1 of the
    2FA password change flow. Confirms the current password and new
    password's validity, stages the (hashed) new password, emails a
    6-digit code to the user's registered email, and returns success -
    the password itself is NOT changed until verify-otp confirms the
    code.

    If the email can't be sent (for example, the email provider
    rejects the address), the unused code is deleted again and the
    user gets a clear message instead of a plain server error.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = RequestPasswordChangeOtpSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        if not request.user.email:
            return Response(
                {"detail": "Your account has no email address. Please add one in My Profile first."},
                status=400,
            )

        # Clear out any old unused codes for this user first, so only
        # the most recently requested code ever works.
        PasswordChangeOTP.objects.filter(user=request.user, is_used=False).delete()

        code = PasswordChangeOTP.generate_code()
        otp = PasswordChangeOTP.objects.create(
            user=request.user,
            code=code,
            new_password=make_password(serializer.validated_data['new_password']),
        )

        try:
            send_code_email(
                request.user,
                code,
                subject='Your Glomax password change code',
                heading='Password Change Verification',
                intro='We received a request to change your account password. Use the code below to confirm this change.',
                minutes=10,
            )
        except Exception:
            # The email didn't go out, so nobody can ever receive this
            # code - remove it and tell the user plainly. The real
            # error still shows in the server terminal.
            logger.exception("Could not send password change code to user %s", request.user.id)
            otp.delete()
            return Response(
                {
                    "detail": "We couldn't send the verification email right now. "
                              "Please try again later, or contact us if this keeps happening."
                },
                status=503,
            )

        return Response({"detail": "A verification code has been sent to your email."})


class VerifyChangePasswordOtpView(APIView):
    """
    POST /api/accounts/change-password/verify-otp/  - Step 2. Checks
    the submitted code against the most recent unused, unexpired code
    for this user, and if it matches, applies the password that was
    staged in step 1.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = VerifyPasswordChangeOtpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data['code']

        try:
            otp = PasswordChangeOTP.objects.filter(
                user=request.user, is_used=False
            ).latest('created_at')
        except PasswordChangeOTP.DoesNotExist:
            return Response({"detail": "No pending password change. Please start again."}, status=400)

        if otp.is_expired():
            return Response({"detail": "This code has expired. Please request a new one."}, status=400)

        if otp.code != code:
            return Response({"detail": "Incorrect code. Please try again."}, status=400)

        request.user.password = otp.new_password  # already hashed in step 1
        request.user.save()
        otp.is_used = True
        otp.save()

        return Response({"detail": "Password updated successfully."})


class RegisterView(generics.CreateAPIView):
    """
    Public endpoint for Customer self-registration.
    POST /api/accounts/register/
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


# --- Separate address per portal ---
# Each portal's login page sends which portal it is ('CUSTOMER',
# 'STAFF', 'PARTNER_INSTALLER' or 'ADMIN'). If the account belongs to
# a different portal, we stop BEFORE the 2FA step, so no SMS or email
# code is wasted, and tell the user which portal to use.

PORTAL_LABELS = {
    'CUSTOMER': 'Customer',
    'STAFF': 'Staff',
    'PARTNER_INSTALLER': 'Partner Installer',
    'ADMIN': 'Admin',
}


def wrong_portal_response(user, portal):
    """
    Returns an error response if this account can't sign in on this
    portal, or None if it's fine. Old login pages that don't send
    'portal' keep working as before.
    """
    portal = str(portal or '').strip().upper()
    if not portal or portal not in PORTAL_LABELS or portal == user.role:
        return None
    label = PORTAL_LABELS.get(user.role, 'correct')
    return Response(
        {
            "detail": f"This is a {label} account. Please sign in on the {label} portal.",
            "wrong_portal": True,
            "role": user.role,
        },
        status=403,
    )


class GlomaxLoginView(APIView):
    """
    POST /api/accounts/login/  - Step 1 of signing in.
    Checks the username and password (same checks as before). If they
    are right, the user does NOT get tokens yet. Instead they get a
    short-lived challenge_token and must enter their 2FA code at
    /api/accounts/2fa/verify/ (or set up 2FA first at
    /api/accounts/2fa/setup/start/ if they haven't yet).
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get_authenticate_header(self, request):
        # Keeps a wrong password as a 401 error, same as before
        return 'Bearer realm="api"'

    def post(self, request):
        serializer = GlomaxTokenObtainPairSerializer(data=request.data, context={'request': request})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        blocked = wrong_portal_response(serializer.user, request.data.get('portal'))
        if blocked:
            return blocked

        # A remembered browser skips the code step
        return start_login_challenge(serializer.user, request.data.get('trusted_devices'))


class MeView(generics.RetrieveUpdateAPIView):
    """
    Returns the currently logged-in user's info, and lets them update
    their own profile (My Profile tab), notification preferences
    (Notifications tab), and profile picture.
    GET   /api/accounts/me/  - fetch current info (must include the access token)
    PATCH /api/accounts/me/  - update profile fields / notification
          preferences / profile picture (partial update - only send
          the fields that changed)
    Accepts both regular JSON (for text fields) and multipart form
    data (needed when uploading a profile picture file at the same
    time as other fields).
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """
    POST /api/accounts/change-password/  - Security & Password card's
    "Update Password" button, still used by the Staff and Partner
    Installer Settings pages. The Customer portal now uses the
    email code flow above instead.
    Requires the current password to match before setting the new one.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()

        return Response({"detail": "Password updated successfully."})


# --- Google login (Customer only) ---

class GoogleLoginView(APIView):
    """
    POST /api/accounts/google-login/  - "Continue with Google" /
    "Sign up with Google" buttons on the Login and Register pages.
    Verifies the ID token directly with Google (no client secret
    needed for this - verification uses Google's public keys), then:
      - if an account with that email already exists, uses it
      - otherwise creates a new CUSTOMER account automatically, using
        the Google account's name/email, with an unusable password
    After that, the same 2FA step as normal login applies: the
    response is a challenge_token, not the real tokens.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data['id_token']

        try:
            payload = google_id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                settings.GOOGLE_CLIENT_ID,
            )
        except ValueError:
            return Response({"detail": "Invalid Google token."}, status=400)

        email = payload.get('email')
        if not email:
            return Response({"detail": "Google account has no email."}, status=400)

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # Only the Customer portal may create new accounts. On the
            # Staff / Partner Installer / Admin portals, the Admin makes
            # the accounts, so don't create a Customer account there.
            portal = str(request.data.get('portal') or '').strip().upper()
            if portal and portal != 'CUSTOMER':
                return Response(
                    {"detail": "No account uses this Google email. Please ask the Admin to set up your account."},
                    status=400,
                )

            # Create a new Customer account automatically. Username
            # can't just be the email (User.username has its own
            # uniqueness/format elsewhere) so we base it on the email's
            # local part plus a short random suffix to avoid collisions.
            base_username = email.split('@')[0][:20]
            username = f"{base_username}_{uuid.uuid4().hex[:6]}"
            user = User.objects.create_user(
                username=username,
                email=email,
                role=User.Role.CUSTOMER,
            )
            user.set_unusable_password()
            user.save()

        if not user.is_active:
            return Response({"detail": "This account is deactivated."}, status=403)

        blocked = wrong_portal_response(user, request.data.get('portal'))
        if blocked:
            return blocked

        # A remembered browser skips the code step
        return start_login_challenge(user, request.data.get('trusted_devices'))


# --- Two-factor login (2FA) during sign-in ---

class TwoFactorVerifyView(APIView):
    """
    POST /api/accounts/2fa/verify/
    Body: { challenge_token, code }
    'code' can be the 6-digit code (SMS or email) or a backup code.
    Returns the real tokens (access, refresh, role, username, user_id).
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        challenge, error = get_open_challenge(
            request.data.get('challenge_token'), LoginChallenge.Purpose.VERIFY
        )
        if error:
            return error

        code = clean_code(request.data.get('code'))
        if not code:
            return Response({"detail": "Please enter your code."}, status=400)

        ok, used_backup = check_login_code(challenge, code)
        if not ok:
            return wrong_code_response(challenge)

        challenge.is_used = True
        challenge.save(update_fields=['is_used'])

        data = issue_tokens(challenge.user)
        if used_backup:
            data['used_backup_code'] = True
            data['backup_codes_left'] = backup_codes_left(challenge.user)
        if request.data.get('remember_device'):
            data['trusted_device_token'] = remember_device(challenge.user, request)
        return Response(data)


class TwoFactorResendView(APIView):
    """
    POST /api/accounts/2fa/resend/
    Body: { challenge_token }
    Sends a new code by SMS or email (whichever this screen uses). Works
    on the sign-in code screen and during setup. Wait 60 seconds between
    text messages and 30 seconds between emails. One screen can send at
    most 5 codes, to protect the SMS credits.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        token = request.data.get('challenge_token')
        challenge = LoginChallenge.objects.select_related('user').filter(token=token).first()
        if not challenge:
            return Response({"detail": "This sign-in session is no longer valid. Please sign in again."}, status=400)

        challenge, error = get_open_challenge(token, challenge.purpose)
        if error:
            return error

        return resend_code(challenge)


class TwoFactorSetupStartView(APIView):
    """
    POST /api/accounts/2fa/setup/start/
    Body: { challenge_token, method: "SMS" | "EMAIL", phone (SMS only, optional) }
    For first-time setup during sign-in.
    SMS   -> texts a code to 'phone' (or the account's phone number).
             If there's no valid number, replies with needs_phone: true.
    EMAIL -> sends a code to the user's email
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        challenge, error = get_open_challenge(
            request.data.get('challenge_token'), LoginChallenge.Purpose.SETUP
        )
        if error:
            return error
        return begin_setup(challenge, request.data.get('method'), request.data.get('phone'))


class TwoFactorSetupConfirmView(APIView):
    """
    POST /api/accounts/2fa/setup/confirm/
    Body: { challenge_token, code }
    Turns 2FA on, then returns the real tokens plus 8 backup codes
    (shown to the user only once).
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        challenge, error = get_open_challenge(
            request.data.get('challenge_token'), LoginChallenge.Purpose.SETUP
        )
        if error:
            return error

        backup_codes, error = finish_setup(challenge, request.data.get('code'))
        if error:
            return error

        data = issue_tokens(challenge.user)
        data['backup_codes'] = backup_codes
        data['method'] = challenge.user.two_factor_method
        if request.data.get('remember_device'):
            data['trusted_device_token'] = remember_device(challenge.user, request)
        return Response(data)


# --- Two-factor settings (already signed in, Settings > Security) ---

class TwoFactorStatusView(APIView):
    """
    GET /api/accounts/2fa/status/
    What the Security tab shows: on/off, method, backup codes left, and
    the masked email / mobile number codes go to.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'enabled': user.two_factor_enabled,
            'method': user.two_factor_method,
            'enabled_at': user.two_factor_enabled_at,
            'backup_codes_left': backup_codes_left(user),
            **contact_hints(user),
        })


class TwoFactorChangeStartView(APIView):
    """
    POST /api/accounts/2fa/change/start/
    Body: { method: "SMS" | "EMAIL", phone (SMS only, optional) }
    Switch to another method (or use a new mobile number). Same
    responses as setup/start. Nothing changes until change/confirm
    succeeds.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        LoginChallenge.objects.filter(
            user=request.user, purpose=LoginChallenge.Purpose.SETUP, is_used=False
        ).update(is_used=True)

        challenge = LoginChallenge.objects.create(
            user=request.user,
            token=LoginChallenge.generate_token(),
            purpose=LoginChallenge.Purpose.SETUP,
        )
        return begin_setup(challenge, request.data.get('method'), request.data.get('phone'))


class TwoFactorChangeConfirmView(APIView):
    """
    POST /api/accounts/2fa/change/confirm/
    Body: { code }
    Saves the new method and returns a fresh set of backup codes.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        challenge = LoginChallenge.objects.filter(
            user=request.user, purpose=LoginChallenge.Purpose.SETUP, is_used=False
        ).order_by('-created_at').first()
        if not challenge:
            return Response({"detail": "Please choose a method first."}, status=400)

        challenge, error = get_open_challenge(challenge.token, LoginChallenge.Purpose.SETUP)
        if error:
            return error

        backup_codes, error = finish_setup(challenge, request.data.get('code'))
        if error:
            return error

        return Response({
            'detail': '2-step login has been updated.',
            'method': challenge.user.two_factor_method,
            'backup_codes': backup_codes,
        })


class TwoFactorSendCodeView(APIView):
    """
    POST /api/accounts/2fa/send-code/
    For users who are already signed in: sends a code by SMS or email
    (their 2FA method) so they can confirm an action, like getting new
    backup codes.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.two_factor_enabled:
            return Response({"detail": "2-step login is not set up yet."}, status=400)

        latest = LoginChallenge.objects.filter(
            user=user, purpose=LoginChallenge.Purpose.VERIFY, is_used=False
        ).order_by('-created_at').first()
        if latest and latest.is_valid():
            wait = can_resend(latest)
            if wait:
                return Response({"detail": f"Please wait {wait} seconds before asking for a new code.", "wait": wait}, status=429)

        LoginChallenge.objects.filter(
            user=user, purpose=LoginChallenge.Purpose.VERIFY, is_used=False
        ).update(is_used=True)
        challenge = LoginChallenge.objects.create(
            user=user,
            token=LoginChallenge.generate_token(),
            purpose=LoginChallenge.Purpose.VERIFY,
        )
        if not send_login_code(challenge):
            return Response({"detail": send_failed_message(user.two_factor_method)}, status=503)
        return Response({
            "detail": "A code has been sent.",
            "resend_wait": RESEND_WAIT_SECONDS.get(user.two_factor_method, 30),
            **sent_to_hint(challenge),
        })


class TwoFactorBackupCodesView(APIView):
    """
    POST /api/accounts/2fa/backup-codes/
    Body: { code }  (the 6-digit code from /2fa/send-code/, by SMS or email)
    Makes 8 new backup codes. The old ones stop working.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.two_factor_enabled:
            return Response({"detail": "2-step login is not set up yet."}, status=400)

        code = clean_code(request.data.get('code'))
        if not is_six_digits(code):
            return Response({"detail": "Please enter the 6-digit code."}, status=400)

        challenge = LoginChallenge.objects.filter(
            user=user, purpose=LoginChallenge.Purpose.VERIFY, is_used=False
        ).order_by('-created_at').first()
        if not challenge or not challenge.is_valid():
            return Response({"detail": "Please send yourself a new code first."}, status=400)
        if not challenge.check_code(code):
            return wrong_code_response(challenge)
        challenge.is_used = True
        challenge.save(update_fields=['is_used'])

        return Response({'backup_codes': BackupCode.create_new_set(user)})


# --- Admin account management (Stage C) ---

class ManageStaffListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/accounts/manage/staff/  - Manage Staff page's table listing
    POST /api/accounts/manage/staff/  - Create New Staff form
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = User.objects.filter(role='STAFF').order_by('username')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffPartnerInstallerCreateSerializer
        return ManagedUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'role': 'STAFF'})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            ManagedUserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class ManagePartnerInstallerListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/accounts/manage/partner-installers/  - Manage Partner
         Installers page's table listing
    POST /api/accounts/manage/partner-installers/  - Create New
         Partner Installer form
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    queryset = User.objects.filter(role='PARTNER_INSTALLER').order_by('username')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StaffPartnerInstallerCreateSerializer
        return ManagedUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={'role': 'PARTNER_INSTALLER'})
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            ManagedUserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class ManagedUserToggleActiveView(APIView):
    """
    PATCH /api/accounts/manage/<id>/toggle-active/  - the Deactivate /
    Reactivate toggle button on both Manage Staff and Manage Partner
    Installers pages. Only works on STAFF or PARTNER_INSTALLER
    accounts - an Admin can't accidentally deactivate a Customer or
    another Admin through this endpoint. Notifies the worker of the
    change.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk, role__in=['STAFF', 'PARTNER_INSTALLER'])
        except User.DoesNotExist:
            return Response({"detail": "Account not found."}, status=404)

        user.is_active = not user.is_active
        user.save()

        if user.is_active:
            notify_worker_account_change(
                user,
                "Your account has been reactivated by the Admin. You can sign in again.",
            )
        else:
            notify_worker_account_change(
                user,
                "Your account has been deactivated by the Admin. Please contact the Admin if you think this is a mistake.",
            )

        return Response(ManagedUserSerializer(user).data)


class AdminSetWorkerPasswordView(APIView):
    """
    PATCH /api/accounts/manage/<id>/set-password/  - Admin's
    "Credentials" modal on the Workers page. Lets Admin set a new
    password for a Staff or Partner Installer account directly.
    Only works on STAFF or PARTNER_INSTALLER accounts, same
    restriction as ManagedUserToggleActiveView. Notifies the worker
    that their password was reset.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk, role__in=['STAFF', 'PARTNER_INSTALLER'])
        except User.DoesNotExist:
            return Response({"detail": "Account not found."}, status=404)

        serializer = AdminSetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.set_password(serializer.validated_data['new_password'])
        user.save()
        # New password: every remembered browser asks for a code again
        forget_devices(user)

        notify_worker_account_change(
            user,
            "The Admin has reset your password. Please use the new password the next time you sign in.",
        )

        return Response({"detail": "Password updated successfully."})


class AdminResetTwoFactorView(APIView):
    """
    POST /api/accounts/manage/<id>/reset-2fa/  - for a Staff, Partner
    Installer, or Customer who lost their phone (or email access) AND
    their backup codes.
    Turns their 2FA off. They will be asked to set it up again the next
    time they sign in. Admin accounts can't be reset here (use the
    'python manage.py reset_2fa <username>' command instead).
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk, role__in=['STAFF', 'PARTNER_INSTALLER', 'CUSTOMER'])
        except User.DoesNotExist:
            return Response({"detail": "Account not found."}, status=404)

        reset_two_factor(user)

        if user.role in WORKER_SETTINGS_LINKS:
            notify_worker_account_change(
                user,
                "The Admin has reset your 2-step login. You will be asked to set it up again the next time you sign in.",
            )

        return Response({"detail": f"2-step login has been reset for {user.username}."})


class StaffPartnerInstallerListView(generics.ListAPIView):
    """
    GET /api/accounts/partner-installers/  - read-only list of active
    Partner Installer accounts, for Staff's Assign Partner Installer
    dropdown (Ticket Progress page). Separate from
    ManagePartnerInstallerListCreateView (Admin-only, can create/manage
    accounts) - Staff can only ever pick from this list, never create
    or deactivate one.
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    queryset = User.objects.filter(role='PARTNER_INSTALLER', is_active=True).order_by('username')
    serializer_class = ManagedUserSerializer