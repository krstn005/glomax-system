from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    GlomaxTokenObtainPairSerializer,
    StaffPartnerInstallerCreateSerializer,
    ManagedUserSerializer,
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


class MeView(generics.RetrieveAPIView):
    """
    Returns the currently logged-in user's info.
    GET /api/accounts/me/  (must include the access token)
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


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