import logging

from django.utils import timezone
from rest_framework import generics, permissions, status, throttling
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import APIView
from rest_framework.response import Response

from anymail.exceptions import AnymailError

from .models import Inquiry, Message
from .serializers import (
    InquiryCreateSerializer,
    InquirySerializer,
    InquirySendQuotationSerializer,
    MessageSerializer,
    MessageCreateSerializer,
    PublicInquiryThreadSerializer,
)
from accounts.permissions import IsStaff
from .utils import send_quotation_email, send_reply_email

logger = logging.getLogger(__name__)


class InquiryCreateView(generics.CreateAPIView):
    """
    POST /api/inquiries/  - public Landing Page contact form.
    No login required - anyone can submit an inquiry.
    """
    queryset = Inquiry.objects.all()
    serializer_class = InquiryCreateSerializer
    permission_classes = [permissions.AllowAny]


class OptionalPageNumberPagination(PageNumberPagination):
    """
    Only paginates when the request explicitly asks for a page (via
    ?page=N). If no ?page param is sent, returns the full unpaginated
    list exactly as before - keeps every existing caller working with
    zero changes needed on their end. Same pattern already used by
    tickets/views.py's StaffTicketListView.
    """
    page_size = 20
    page_query_param = 'page'

    def paginate_queryset(self, queryset, request, view=None):
        if request.query_params.get(self.page_query_param) is None:
            return None
        return super().paginate_queryset(queryset, request, view)


class InquiryListView(generics.ListAPIView):
    """
    GET /api/inquiries/staff/  - Staff's Email Inquiries page listing.
    Optional ?is_replied=false filter to show only unanswered ones.
    Optional ?page=N for pagination (20 per page) - omit ?page
    entirely to get the full list, same as before this was added.
    Always sorted with unread customer replies first (has_unread_reply
    descending), then newest-received first, so Staff sees inquiries
    needing attention at the top of the list rather than buried
    wherever they happen to fall by date.
    """
    serializer_class = InquirySerializer
    permission_classes = [permissions.IsAuthenticated, IsStaff]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        queryset = Inquiry.objects.all().order_by('-has_unread_reply', '-received_at')
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

    If the email fails to send (e.g. Resend sandbox restriction, rate
    limit, or any API error), this now returns a clear 502 error
    instead of an unhandled 500 - and deliberately does NOT save the
    quotation fields or set quotation_sent=True in that case, so Staff
    can safely retry without it being silently marked as already sent.
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

        try:
            send_quotation_email(
                inquiry=inquiry,
                package_details=data["package_details"],
                estimated_cost=data["estimated_cost"],
                payment_terms=data["payment_terms"],
                notes=data.get("notes", ""),
            )
        except AnymailError as e:
            logger.error(f"Failed to send quotation email for inquiry {pk}: {e}")
            return Response(
                {"detail": "Could not send the quotation email. Please check the email service and try again."},
                status=status.HTTP_502_BAD_GATEWAY,
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


# --- Staff-side conversation thread ---

class StaffInquiryMessagesView(APIView):
    """
    GET  /api/inquiries/staff/<id>/messages/  - list the full
         follow-up conversation thread for one inquiry (Staff view).
         Also clears has_unread_reply, since Staff is now viewing it.
    POST /api/inquiries/staff/<id>/messages/  - Staff sends a reply.
         Saves the message FIRST (so it's never lost even if the
         email fails), then tries to email the customer. If the email
         fails (Resend sandbox restriction, rate limit, API error,
         etc.), the saved message and a 201 response are still
         returned, but with an "email_sent": false flag and a
         "warning" message, so the frontend can show Staff a clear
         heads-up instead of a broken page.
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def get_inquiry(self, pk):
        try:
            return Inquiry.objects.get(pk=pk)
        except Inquiry.DoesNotExist:
            return None

    def get(self, request, pk):
        inquiry = self.get_inquiry(pk)
        if inquiry is None:
            return Response({"detail": "Inquiry not found."}, status=404)

        if inquiry.has_unread_reply:
            inquiry.has_unread_reply = False
            inquiry.save(update_fields=["has_unread_reply"])

        messages = inquiry.messages.all()
        return Response(MessageSerializer(messages, many=True).data)

    def post(self, request, pk):
        inquiry = self.get_inquiry(pk)
        if inquiry is None:
            return Response({"detail": "Inquiry not found."}, status=404)

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]

        message = Message.objects.create(
            inquiry=inquiry,
            sender_type=Message.SenderType.STAFF,
            staff_user=request.user,
            content=content,
        )

        email_sent = True
        warning = None
        try:
            send_reply_email(inquiry=inquiry, staff_message_content=content)
        except AnymailError as e:
            logger.error(f"Failed to send reply email for inquiry {pk}: {e}")
            email_sent = False
            warning = "Your reply was saved, but the email to the customer could not be sent. Please check the email service."

        inquiry.is_replied = True
        inquiry.save(update_fields=["is_replied"])

        response_data = MessageSerializer(message).data
        response_data["email_sent"] = email_sent
        if warning:
            response_data["warning"] = warning

        return Response(response_data, status=status.HTTP_201_CREATED)


# --- Public, no-login reply-link thread (customer side) ---

class _TokenScopedThrottle(throttling.SimpleRateThrottle):
    """
    Base throttle keyed by the access_token in the URL (not just IP),
    so a single link can't be hammered from many different IPs, and a
    single IP can't hammer many different links either.
    """

    def get_cache_key(self, request, view):
        token = view.kwargs.get("token")
        ident = self.get_ident(request)
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"{token}:{ident}",
        }


class PublicInquiryReadThrottle(_TokenScopedThrottle):
    """
    Covers GET only - viewing the thread. This is what the page's
    15-second auto-refresh polling hits repeatedly while the page is
    open, so this needs a much higher ceiling than writing does; it's
    read-only and low-risk regardless of how often it's called.
    """
    scope = "inquiry_public_read"


class PublicInquiryWriteThrottle(_TokenScopedThrottle):
    """
    Covers POST only - submitting a new follow-up message. Kept tight,
    since this is the actual abuse-prone action (someone scripting
    repeated message submissions).
    """
    scope = "inquiry_public_write"


class PublicInquiryThreadView(APIView):
    """
    GET  /api/inquiries/public/<uuid:token>/  - the public, no-login
         reply-link page's data: read-only inquiry info, the saved
         Initial Quotation, and the full follow-up message thread.
         Polled automatically every 15s by the frontend while the
         page is open, so this uses a generous throttle.
    POST /api/inquiries/public/<uuid:token>/  - the customer submits a
         new follow-up message from that same page. Sets
         has_unread_reply = True so Staff sees a notification badge.
         Uses a tighter throttle, since this is a real write action.

    Both actions are scoped ENTIRELY by the access_token in the URL -
    there is no other way to reach a specific inquiry through this
    endpoint, and PublicInquiryThreadSerializer never exposes the
    token or database id back out, so nothing here can be used to
    enumerate or guess other inquiries.
    """
    permission_classes = [permissions.AllowAny]

    def get_throttles(self):
        if self.request.method == "POST":
            return [PublicInquiryWriteThrottle()]
        return [PublicInquiryReadThrottle()]

    def get_inquiry(self, token):
        try:
            return Inquiry.objects.get(access_token=token)
        except (Inquiry.DoesNotExist, ValueError):
            return None

    def get(self, request, token):
        inquiry = self.get_inquiry(token)
        if inquiry is None:
            return Response({"detail": "This link is no longer valid."}, status=404)

        return Response(PublicInquiryThreadSerializer(inquiry).data)

    def post(self, request, token):
        inquiry = self.get_inquiry(token)
        if inquiry is None:
            return Response({"detail": "This link is no longer valid."}, status=404)

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]

        Message.objects.create(
            inquiry=inquiry,
            sender_type=Message.SenderType.CUSTOMER,
            content=content,
        )

        inquiry.has_unread_reply = True
        inquiry.save(update_fields=["has_unread_reply"])

        return Response(PublicInquiryThreadSerializer(inquiry).data, status=status.HTTP_201_CREATED)


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

        try:
            send_quotation_email(
                inquiry=inquiry,
                package_details=data["package_details"],
                estimated_cost=data["estimated_cost"],
                payment_terms=data["payment_terms"],
                notes=data.get("notes", ""),
            )
        except AnymailError as e:
            logger.error(f"Failed to send quotation email for inquiry {pk}: {e}")
            return Response(
                {"detail": "Could not send the quotation email. Please check the email service and try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        inquiry.quotation_package_details = data["package_details"]
        inquiry.quotation_estimated_cost = data["estimated_cost"]
        inquiry.quotation_payment_terms = data["payment_terms"]
        inquiry.quotation_message_to_customer = data.get("notes", "")
        inquiry.quotation_sent = True
        inquiry.quotation_sent_at = timezone.now()
        inquiry.is_replied = True
        inquiry.save()

        # If the Customer already has an account and a ticket (they
        # submitted their Schedule Request before Staff got around to
        # replying to their inquiry), link this Initial Quotation onto
        # that ticket right now instead of waiting for a ticket that
        # already exists and never will trigger the other direction's
        # auto-link logic.
        from tickets.models import Ticket
        from tickets.quotation_linking import link_initial_quotation_to_ticket

        matching_ticket = (
            Ticket.objects.filter(customer__email__iexact=inquiry.email)
            .order_by('-created_at')
            .first()
        )
        if matching_ticket:
            link_initial_quotation_to_ticket(matching_ticket, inquiry)

        return Response(InquirySerializer(inquiry).data, status=status.HTTP_200_OK)