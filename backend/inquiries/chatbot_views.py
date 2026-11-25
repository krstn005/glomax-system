"""
Chatbot endpoints:
  POST /api/inquiries/chatbot/ask/               public chat box on the website
  GET/POST /api/inquiries/admin/faqs/            Admin: list and add FAQs
  PATCH/DELETE /api/inquiries/admin/faqs/<id>/   Admin: edit or remove one
  POST /api/inquiries/admin/faqs/load-defaults/  Admin: add the suggested FAQs
"""
from rest_framework import generics, permissions, serializers
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from .chatbot import DEFAULT_FAQS, answer_question
from .models import FaqEntry


class ChatbotAskThrottle(SimpleRateThrottle):
    """Most questions one internet address can ask per hour."""
    scope = 'glomax_chatbot'
    rate = '60/hour'

    def get_cache_key(self, request, view):
        return self.cache_format % {'scope': self.scope, 'ident': self.get_ident(request)}


class ChatbotAskView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ChatbotAskThrottle]

    def post(self, request):
        text = str(request.data.get('message') or '').strip()
        if not text:
            return Response({'detail': 'Please type a question.'}, status=400)
        return Response(answer_question(text[:300]))


class FaqEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = FaqEntry
        fields = ['id', 'question', 'keywords', 'answer', 'is_active', 'sort_order', 'updated_at']
        read_only_fields = ['id', 'updated_at']

    def validate_question(self, value):
        value = ' '.join(value.split())
        if len(value) < 5:
            raise serializers.ValidationError('Please write the full question.')
        return value

    def validate_answer(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError('Please write a fuller answer.')
        return value

    def validate_keywords(self, value):
        if not [k for k in value.replace('\n', ',').split(',') if k.strip()]:
            raise serializers.ValidationError('Add at least one keyword, separated by commas.')
        return value.strip()


class FaqAdminListCreateView(generics.ListCreateAPIView):
    queryset = FaqEntry.objects.all()
    serializer_class = FaqEntrySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    pagination_class = None


class FaqAdminDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = FaqEntry.objects.all()
    serializer_class = FaqEntrySerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]


class FaqLoadDefaultsView(APIView):
    """Adds the suggested FAQs. Only works while the list is empty."""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def post(self, request):
        if FaqEntry.objects.exists():
            return Response({'detail': 'The FAQ list is not empty, so nothing was added.'}, status=400)
        FaqEntry.objects.bulk_create([FaqEntry(**row) for row in DEFAULT_FAQS])
        return Response({'detail': f'{len(DEFAULT_FAQS)} suggested FAQs were added.'}, status=201)