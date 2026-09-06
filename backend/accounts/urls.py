from django.urls import path
from .views import (
    RegisterView,
    GlomaxLoginView,
    MeView,
    ChangePasswordView,
    GoogleLoginView,
    ManageStaffListCreateView,
    ManagePartnerInstallerListCreateView,
    ManagedUserToggleActiveView,
    StaffPartnerInstallerListView,
    AdminSetWorkerPasswordView,
)
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', GlomaxLoginView.as_view(), name='login'),
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('google-login/', GoogleLoginView.as_view(), name='google-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('manage/staff/', ManageStaffListCreateView.as_view(), name='manage-staff'),
    path(
        'manage/partner-installers/',
        ManagePartnerInstallerListCreateView.as_view(),
        name='manage-partner-installers',
    ),
    path(
        'manage/<int:pk>/toggle-active/',
        ManagedUserToggleActiveView.as_view(),
        name='manage-toggle-active',
    ),
    path(
        'manage/<int:pk>/set-password/',
        AdminSetWorkerPasswordView.as_view(),
        name='manage-set-password',
    ),
    path(
        'partner-installers/',
        StaffPartnerInstallerListView.as_view(),
        name='staff-partner-installer-list',
    ),
]