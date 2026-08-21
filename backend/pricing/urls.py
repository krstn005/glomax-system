from django.urls import path
from .views import TicketQuotationListCreateView, PaymentTermsListView, PriceHistoryListView

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
    path(
        'price-history/',
        PriceHistoryListView.as_view(),
        name='price-history-list',
    ),
]