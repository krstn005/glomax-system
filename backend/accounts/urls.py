from django.urls import path
from .views import (
    MeView,
    RequestChangePasswordOtpView,
    GoogleLoginView,
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
    SendPasswordLinkView,
    PasswordSetupCheckView,
    PasswordSetupCompleteView,
    AdminResetTwoFactorView,
)
# Sign-in views with the wrong-password lockout and the audit log
from .security import (
    SecureLoginView,
    SecureTwoFactorVerifyView,
    AuditedChangePasswordView,
    AuditedVerifyChangePasswordOtpView,
    AuditLogListView,
)
# Sign-up with email + phone codes
from .registration import (
    RegisterStartView,
    RegisterVerifyView,
    RegisterResendView,
)
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    # Sign-up: no account is made until BOTH the email code and the phone
    # code are right. The old one-step register/ address was removed on
    # purpose, so nobody can skip the codes.
    path('register/start/', RegisterStartView.as_view(), name='register-start'),
    path('register/verify/', RegisterVerifyView.as_view(), name='register-verify'),
    path('register/resend/', RegisterResendView.as_view(), name='register-resend'),

    path('login/', SecureLoginView.as_view(), name='login'),
    path('me/', MeView.as_view(), name='me'),
    path('change-password/', AuditedChangePasswordView.as_view(), name='change-password'),
    path('change-password/request-otp/', RequestChangePasswordOtpView.as_view(), name='change-password-request-otp'),
    path('change-password/verify-otp/', AuditedVerifyChangePasswordOtpView.as_view(), name='change-password-verify-otp'),
    path('google-login/', GoogleLoginView.as_view(), name='google-login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),

    # Two-factor login (2FA) - during sign-in
    path('2fa/verify/', SecureTwoFactorVerifyView.as_view(), name='2fa-verify'),
    path('2fa/resend/', TwoFactorResendView.as_view(), name='2fa-resend'),
    path('2fa/setup/start/', TwoFactorSetupStartView.as_view(), name='2fa-setup-start'),
    path('2fa/setup/confirm/', TwoFactorSetupConfirmView.as_view(), name='2fa-setup-confirm'),

    # Two-factor login (2FA) - Settings > Security
    path('2fa/status/', TwoFactorStatusView.as_view(), name='2fa-status'),
    path('2fa/change/start/', TwoFactorChangeStartView.as_view(), name='2fa-change-start'),
    path('2fa/change/confirm/', TwoFactorChangeConfirmView.as_view(), name='2fa-change-confirm'),
    path('2fa/send-code/', TwoFactorSendCodeView.as_view(), name='2fa-send-code'),
    path('2fa/backup-codes/', TwoFactorBackupCodesView.as_view(), name='2fa-backup-codes'),

    # Worker sets their own password from the emailed link (public)
    path('password-setup/check/', PasswordSetupCheckView.as_view(), name='password-setup-check'),
    path('password-setup/complete/', PasswordSetupCompleteView.as_view(), name='password-setup-complete'),

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
        'manage/<int:pk>/send-password-link/',
        SendPasswordLinkView.as_view(),
        name='manage-send-password-link',
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

    # Admin: read the audit log
    path('admin/audit-log/', AuditLogListView.as_view(), name='admin-audit-log'),
]