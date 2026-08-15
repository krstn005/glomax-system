import uuid

from django.conf import settings
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
)
from .models import User
from accounts.permissions import IsAdmin


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