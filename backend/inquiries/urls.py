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
from .chatbot_views import (
    ChatbotAskView,
    FaqAdminListCreateView,
    FaqAdminDetailView,
    FaqLoadDefaultsView,
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

    # Chatbot: the chat box on the website (public)
    path('chatbot/ask/', ChatbotAskView.as_view(), name='chatbot-ask'),

    # Chatbot: Admin manages the FAQ list
    path('admin/faqs/', FaqAdminListCreateView.as_view(), name='chatbot-faq-list'),
    path('admin/faqs/load-defaults/', FaqLoadDefaultsView.as_view(), name='chatbot-faq-defaults'),
    path('admin/faqs/<int:pk>/', FaqAdminDetailView.as_view(), name='chatbot-faq-detail'),
]