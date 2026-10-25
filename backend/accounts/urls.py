from django.urls import path
from .views import (
    RegisterView,
    GlomaxLoginView,
    MeView,
    ChangePasswordView,
    RequestChangePasswordOtpView,
    VerifyChangePasswordOtpView,
    GoogleLoginView,
    TwoFactorVerifyView,
    TwoFactorResendView,
    TwoFactorSetupStartView,
    TwoFactorSetupConfirmView,
    TwoFactorStatusView,
    TwoFactorChangeStartView,
    TwoFactorChangeConfirmView,
    TwoFactorSendCodeView,
    TwoFactorBackupCodesView,
    ManageStaffListCreateView,
    ManagePartnerInstallerListCreateView,
    ManagedUserToggleActiveView,
    StaffPartnerInstallerListView,
    AdminSetWorkerPasswordView,
    AdminResetTwoFactorView,
)
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', GlomaxLoginView.as_view(), name='login'),
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('change-password/request-otp/', RequestChangePasswordOtpView.as_view(), name='change-password-request-otp'),
    path('change-password/verify-otp/', VerifyChangePasswordOtpView.as_view(), name='change-password-verify-otp'),
    path('google-login/', GoogleLoginView.as_view(), name='google-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),

    # Two-factor login (2FA) - during sign-in
    path('2fa/verify/', TwoFactorVerifyView.as_view(), name='2fa-verify'),
    path('2fa/resend/', TwoFactorResendView.as_view(), name='2fa-resend'),
    path('2fa/setup/start/', TwoFactorSetupStartView.as_view(), name='2fa-setup-start'),
    path('2fa/setup/confirm/', TwoFactorSetupConfirmView.as_view(), name='2fa-setup-confirm'),

    # Two-factor login (2FA) - Settings > Security
    path('2fa/status/', TwoFactorStatusView.as_view(), name='2fa-status'),
    path('2fa/change/start/', TwoFactorChangeStartView.as_view(), name='2fa-change-start'),
    path('2fa/change/confirm/', TwoFactorChangeConfirmView.as_view(), name='2fa-change-confirm'),
    path('2fa/send-code/', TwoFactorSendCodeView.as_view(), name='2fa-send-code'),
    path('2fa/backup-codes/', TwoFactorBackupCodesView.as_view(), name='2fa-backup-codes'),

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
        'manage/<int:pk>/reset-2fa/',
        AdminResetTwoFactorView.as_view(),
        name='manage-reset-2fa',
    ),
    path(
        'partner-installers/',
        StaffPartnerInstallerListView.as_view(),
        name='staff-partner-installer-list',
    ),
]