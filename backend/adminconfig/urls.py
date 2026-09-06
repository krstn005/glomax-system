from django.urls import path
from .views import (
    SmsTemplateListCreateView,
    SmsTemplateDetailView,
    SystemSettingListCreateView,
    SystemSettingDetailView,
    FaqListCreateView,
    FaqDetailView,
    PublicFaqListView,
)

urlpatterns = [
    path('sms-templates/', SmsTemplateListCreateView.as_view(), name='sms-template-list-create'),
    path('sms-templates/<int:pk>/', SmsTemplateDetailView.as_view(), name='sms-template-detail'),
    path('system-settings/', SystemSettingListCreateView.as_view(), name='system-setting-list-create'),
    path('system-settings/<int:pk>/', SystemSettingDetailView.as_view(), name='system-setting-detail'),
    path('faqs/', FaqListCreateView.as_view(), name='faq-list-create'),
    path('faqs/<int:pk>/', FaqDetailView.as_view(), name='faq-detail'),
    path('faqs/public/', PublicFaqListView.as_view(), name='faq-public-list'),
]