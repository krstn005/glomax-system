from django.urls import path
from .views import (
    TicketListCreateView,
    TicketDetailView,
    TicketWithdrawView,
    StaffTicketListView,
    TicketAssignView,
    TicketDecisionView,
)

urlpatterns = [
    path('', TicketListCreateView.as_view(), name='ticket-list-create'),
    path('staff/', StaffTicketListView.as_view(), name='ticket-staff-list'),
    path('<int:pk>/', TicketDetailView.as_view(), name='ticket-detail'),
    path('<int:pk>/withdraw/', TicketWithdrawView.as_view(), name='ticket-withdraw'),
    path('<int:pk>/assign/', TicketAssignView.as_view(), name='ticket-assign'),
    path('<int:pk>/decision/', TicketDecisionView.as_view(), name='ticket-decision'),
]