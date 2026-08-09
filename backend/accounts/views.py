from rest_framework import generics, permissions
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import RegisterSerializer, UserSerializer, GlomaxTokenObtainPairSerializer
from .models import User


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