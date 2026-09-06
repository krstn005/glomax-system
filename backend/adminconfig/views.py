from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import SmsTemplate, SystemSetting, Faq
from .serializers import (
    SmsTemplateSerializer,
    SystemSettingSerializer,
    FaqSerializer,
    PublicFaqSerializer,
)
from accounts.permissions import IsAdmin


class SmsTemplateListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/adminconfig/sms-templates/  - list all SMS templates
    POST /api/adminconfig/sms-templates/  - create a new one
    Admin only.
    """
    queryset = SmsTemplate.objects.all()
    serializer_class = SmsTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class SmsTemplateDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/adminconfig/sms-templates/<id>/
    Admin only.
    """
    queryset = SmsTemplate.objects.all()
    serializer_class = SmsTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class SystemSettingListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/adminconfig/system-settings/  - list all key-value settings
    POST /api/adminconfig/system-settings/  - add a new setting key
    Admin only.
    """
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class SystemSettingDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/adminconfig/system-settings/<id>/
    Admin only.
    """
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class FaqListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/adminconfig/faqs/  - list all FAQs (Admin sees published
         and unpublished both, so they can manage drafts).
    POST /api/adminconfig/faqs/  - add a new FAQ.
    Admin only.
    """
    queryset = Faq.objects.all()
    serializer_class = FaqSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class FaqDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/adminconfig/faqs/<id>/
    Admin only.
    """
    queryset = Faq.objects.all()
    serializer_class = FaqSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class PublicFaqListView(generics.ListAPIView):
    """
    GET /api/adminconfig/faqs/public/  - published FAQs only, for the
    Customer-facing FAQ display. Any logged-in user can view (not
    Admin-only) - the actual Customer FAQ page will call this one,
    not the Admin management endpoint above.
    """
    queryset = Faq.objects.filter(is_published=True)
    serializer_class = PublicFaqSerializer
    permission_classes = [permissions.IsAuthenticated]


class PublicSystemSettingView(APIView):
    """
    GET /api/adminconfig/system-settings/public/<key>/  - read-only
    lookup of one setting's value by key, for any logged-in user (not
    Admin-only) to consume in customer-facing or any-role pages. If
    the key doesn't exist yet, returns an empty value rather than a
    404 - the frontend can just show nothing/a fallback instead of
    treating an unset setting as an error.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, key):
        setting = SystemSetting.objects.filter(key=key).first()
        return Response({"key": key, "value": setting.value if setting else ""})