import uuid
import os
from email.mime.image import MIMEImage

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail, EmailMultiAlternatives
from rest_framework import generics, permissions, status, parsers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
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
from .models import User, PasswordChangeOTP
from accounts.permissions import IsAdmin, IsStaff


class RequestChangePasswordOtpView(APIView):
    """
    POST /api/accounts/change-password/request-otp/  - Step 1 of the
    2FA password change flow. Confirms the current password and new
    password's validity, stages the (hashed) new password, emails a
    6-digit code to the user's registered email, and returns success -
    the password itself is NOT changed until verify-otp confirms the
    code.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = RequestPasswordChangeOtpSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # Clear out any old unused codes for this user first, so only
        # the most recently requested code ever works.
        PasswordChangeOTP.objects.filter(user=request.user, is_used=False).delete()

        code = PasswordChangeOTP.generate_code()
        PasswordChangeOTP.objects.create(
            user=request.user,
            code=code,
            new_password=make_password(serializer.validated_data['new_password']),
        )

        plain_message = (
            f'Your verification code is {code}. It expires in 10 minutes. '
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
                <h2 style="margin:0 0 12px;color:#0d1f3c;font-size:20px;">Password Change Verification</h2>
                <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
                  We received a request to change your account password. Use the code below to confirm this change.
                </p>
                <div style="text-align:center;margin:0 0 24px;">
                  <span style="display:inline-block;background-color:#fef9c3;border:1.5px solid #eab308;border-radius:10px;padding:16px 32px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#0d1f3c;">
                    {code}
                  </span>
                </div>
                <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
                  This code will expire in <strong>10 minutes</strong>.
                </p>
                <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                  If you didn't request this change, you can safely ignore this email.
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
            subject='Your Glomax password change code',
            body=plain_message,
            from_email=None,  # uses DEFAULT_FROM_EMAIL
            to=[request.user.email],
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
            pass  # email still sends fine without the logo if the file isn't found

        email.send()

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


class GlomaxLoginView(TokenObtainPairView):
    """
    Login endpoint - returns access token, refresh token, and role.
    POST /api/accounts/login/
    """
    serializer_class = GlomaxTokenObtainPairSerializer


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
    "Update Password" button, used by every role's Settings page.
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
      - if an account with that email already exists, logs into it
      - otherwise creates a new CUSTOMER account automatically, using
        the Google account's name/email, with an unusable password
        (the account can only ever be accessed via Google login,
        unless the person later sets a real password through Settings
        - not built yet, matches the rest of the project's pattern of
        building the core flow first)
    Returns the exact same response shape as the normal login endpoint
    (access, refresh, role, username, user_id), so the frontend can
    treat both login methods identically after this point.
    """
    permission_classes = [permissions.AllowAny]

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

        refresh = RefreshToken.for_user(user)
        refresh['role'] = user.role
        refresh['username'] = user.username

        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'role': user.role,
            'username': user.username,
            'user_id': user.id,
        })


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
    another Admin through this endpoint.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk, role__in=['STAFF', 'PARTNER_INSTALLER'])
        except User.DoesNotExist:
            return Response({"detail": "Account not found."}, status=404)

        user.is_active = not user.is_active
        user.save()

        return Response(ManagedUserSerializer(user).data)


class AdminSetWorkerPasswordView(APIView):
    """
    PATCH /api/accounts/manage/<id>/set-password/  - Admin's
    "Credentials" modal on the Workers page. Lets Admin set a new
    password for a Staff or Partner Installer account directly.
    Only works on STAFF or PARTNER_INSTALLER accounts, same
    restriction as ManagedUserToggleActiveView.
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

        return Response({"detail": "Password updated successfully."})


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