from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import RegisterView, GlomaxLoginView, MeView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', GlomaxLoginView.as_view(), name='login'),
    path('login/refresh/', TokenRefreshView.as_view(), name='login-refresh'),
    path('me/', MeView.as_view(), name='me'),
]