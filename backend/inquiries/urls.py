from django.urls import path
from .views import (
    InquiryCreateView,
    InquiryListView,
    InquiryDetailView,
    InquiryMarkRepliedView,
    InquirySendQuotationView,
    StaffInquiryMessagesView,
    PublicInquiryThreadView,
)

urlpatterns = [
    path('', InquiryCreateView.as_view(), name='inquiry-create'),
    path('staff/', InquiryListView.as_view(), name='inquiry-staff-list'),
    path('staff/<int:pk>/', InquiryDetailView.as_view(), name='inquiry-staff-detail'),
    path(
        'staff/<int:pk>/mark-replied/',
        InquiryMarkRepliedView.as_view(),
        name='inquiry-mark-replied',
    ),
    path(
        'staff/<int:pk>/send-quotation/',
        InquirySendQuotationView.as_view(),
        name='inquiry-send-quotation',
    ),
    path(
        'staff/<int:pk>/messages/',
        StaffInquiryMessagesView.as_view(),
        name='inquiry-staff-messages',
    ),
    path(
        'public/<uuid:token>/',
        PublicInquiryThreadView.as_view(),
        name='inquiry-public-thread',
    ),
]