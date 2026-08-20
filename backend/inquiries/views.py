from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Inquiry
from .serializers import (
    InquiryCreateSerializer,
    InquirySerializer,
    InquirySendQuotationSerializer,
)
from accounts.permissions import IsStaff
from .utils import send_quotation_email


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
    GET /api/inquiries/staff/<id>/  - view one inquiry's full details,
    including the saved Initial Quotation if one has already been sent.
    """
    queryset = Inquiry.objects.all()
    serializer_class = InquirySerializer
    permission_classes = [permissions.IsAuthenticated, IsStaff]


class InquiryMarkRepliedView(APIView):
    """
    PATCH /api/inquiries/staff/<id>/mark-replied/  - marks an inquiry
    as replied without sending a quotation (manual override if needed).
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


class InquirySendQuotationView(APIView):
    """
    POST /api/inquiries/staff/<id>/send-quotation/  - Staff's
    "Send Initial Quotation" action. Sends a real email via Resend
    AND saves the quotation content onto the Inquiry so it can be
    viewed again later. Can only be sent once per inquiry - a second
    attempt is blocked with a 400 error.
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def post(self, request, pk):
        try:
            inquiry = Inquiry.objects.get(pk=pk)
        except Inquiry.DoesNotExist:
            return Response({"detail": "Inquiry not found."}, status=404)

        if inquiry.quotation_sent:
            return Response(
                {"detail": "An Initial Quotation has already been sent for this inquiry."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = InquirySendQuotationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        send_quotation_email(
            inquiry=inquiry,
            package_details=data["package_details"],
            estimated_cost=data["estimated_cost"],
            payment_terms=data["payment_terms"],
            notes=data.get("notes", ""),
        )

        inquiry.quotation_package_details = data["package_details"]
        inquiry.quotation_estimated_cost = data["estimated_cost"]
        inquiry.quotation_payment_terms = data["payment_terms"]
        inquiry.quotation_message_to_customer = data.get("notes", "")
        inquiry.quotation_sent = True
        inquiry.quotation_sent_at = timezone.now()
        inquiry.is_replied = True
        inquiry.save()

        return Response(InquirySerializer(inquiry).data, status=status.HTTP_200_OK)