from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Inquiry
from .serializers import InquiryCreateSerializer, InquirySerializer
from accounts.permissions import IsStaff


class InquiryCreateView(generics.CreateAPIView):
    """
    POST /api/inquiries/  - public Landing Page contact form.
    No login required - anyone can submit an inquiry.
    """
    queryset = Inquiry.objects.all()
    serializer_class = InquiryCreateSerializer
    permission_classes = [permissions.AllowAny]


class InquiryListView(generics.ListAPIView):
    """
    GET /api/inquiries/staff/  - Staff's Email Inquiries page listing.
    Optional ?is_replied=false filter to show only unanswered ones.
    """
    serializer_class = InquirySerializer
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get_queryset(self):
        queryset = Inquiry.objects.all()
        is_replied = self.request.query_params.get('is_replied')
        if is_replied is not None:
            queryset = queryset.filter(is_replied=(is_replied.lower() == 'true'))
        return queryset


class InquiryDetailView(generics.RetrieveAPIView):
    """
    GET /api/inquiries/staff/<id>/  - view one inquiry's full details
    (Staff's "View and Reply" panel).
    """
    queryset = Inquiry.objects.all()
    serializer_class = InquirySerializer
    permission_classes = [permissions.IsAuthenticated, IsStaff]


class InquiryMarkRepliedView(APIView):
    """
    PATCH /api/inquiries/staff/<id>/mark-replied/  - marks an inquiry
    as replied, once Staff has sent the Initial Quotation via email
    (email sending itself is not implemented yet - Semaphore/email
    notifications are still deferred, matching the rest of the
    project's notification status).
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def patch(self, request, pk):
        try:
            inquiry = Inquiry.objects.get(pk=pk)
        except Inquiry.DoesNotExist:
            return Response({"detail": "Inquiry not found."}, status=404)

        inquiry.is_replied = True
        inquiry.save()

        return Response(InquirySerializer(inquiry).data)