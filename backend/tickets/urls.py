from django.urls import path
from .views import (
    TicketListCreateView,
    TicketDetailView,
    TicketWithdrawView,
    StaffTicketListView,
    TicketAssignView,
    TicketDecisionView,
    InstallerTicketListView,
    AdminTicketListView,
    TicketApproveView,
    TicketReturnForRevisionView,
)

urlpatterns = [
    path('', TicketListCreateView.as_view(), name='ticket-list-create'),
    path('staff/', StaffTicketListView.as_view(), name='ticket-staff-list'),
    path('installer/', InstallerTicketListView.as_view(), name='ticket-installer-list'),
    path('admin/', AdminTicketListView.as_view(), name='ticket-admin-list'),
    path('<int:pk>/', TicketDetailView.as_view(), name='ticket-detail'),
    path('<int:pk>/withdraw/', TicketWithdrawView.as_view(), name='ticket-withdraw'),
    path('<int:pk>/assign/', TicketAssignView.as_view(), name='ticket-assign'),
    path('<int:pk>/decision/', TicketDecisionView.as_view(), name='ticket-decision'),
    path('<int:pk>/approve/', TicketApproveView.as_view(), name='ticket-approve'),
    path(
        '<int:pk>/return-for-revision/',
        TicketReturnForRevisionView.as_view(),
        name='ticket-return-for-revision',
    ),
]