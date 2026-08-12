from django.urls import path
from .views import (
    RegisterView,
    GlomaxLoginView,
    MeView,
    ManageStaffListCreateView,
    ManagePartnerInstallerListCreateView,
    ManagedUserToggleActiveView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', GlomaxLoginView.as_view(), name='login'),
    path('me/', MeView.as_view(), name='me'),
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
]