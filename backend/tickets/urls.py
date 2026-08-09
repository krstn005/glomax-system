from django.urls import path
from .views import TicketListCreateView, TicketDetailView, TicketWithdrawView

urlpatterns = [
    path('', TicketListCreateView.as_view(), name='ticket-list-create'),
    path('<int:pk>/', TicketDetailView.as_view(), name='ticket-detail'),
    path('<int:pk>/withdraw/', TicketWithdrawView.as_view(), name='ticket-withdraw'),
]