from django.urls import path
from .views import TicketQuotationListCreateView, PaymentTermsListView

urlpatterns = [
    path(
        'tickets/<int:pk>/quotations/',
        TicketQuotationListCreateView.as_view(),
        name='ticket-quotation-list-create',
    ),
    path(
        'payment-terms/',
        PaymentTermsListView.as_view(),
        name='payment-terms-list',
    ),
]