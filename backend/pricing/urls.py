from django.urls import path
from .views import TicketQuotationListCreateView

urlpatterns = [
    path(
        'tickets/<int:pk>/quotations/',
        TicketQuotationListCreateView.as_view(),
        name='ticket-quotation-list-create',
    ),
]