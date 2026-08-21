from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from tickets.models import Ticket
from .models import Quotation, PaymentTerms, PriceHistory
from .serializers import (
    QuotationSerializer,
    QuotationCreateSerializer,
    PaymentTermsSerializer,
    PriceHistorySerializer,
)


class PaymentTermsListView(generics.ListAPIView):
    """
    GET /api/pricing/payment-terms/  - read-only list of all existing
    Payment Terms, newest first. Used to populate the dropdown on
    Staff's Updated Quotation form.
    """
    queryset = PaymentTerms.objects.all()
    serializer_class = PaymentTermsSerializer
    permission_classes = [permissions.IsAuthenticated]


class PriceHistoryListView(generics.ListAPIView):
    """
    GET /api/pricing/price-history/  - read-only list of all Price
    History entries, newest first (model's default ordering). Staff's
    Active Prices page filters this down to is_active=True on the
    frontend; a future Price History page would show the full list.
    """
    queryset = PriceHistory.objects.all()
    serializer_class = PriceHistorySerializer
    permission_classes = [permissions.IsAuthenticated]


class TicketQuotationListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tickets/<id>/quotations/  - list all quotations sent for
         this ticket (oldest first is reversed by model ordering, so
         this naturally shows newest first - matches "Initial" then
         later "Updated" quotations appearing as they're sent).
         Allowed for: the ticket's own Customer, or Staff/Admin.
    POST /api/tickets/<id>/quotations/  - send a new quotation for this
         ticket (Initial or Updated). Staff only. An Updated Quotation
         is additionally restricted to the correct ticket status (see
         QuotationCreateSerializer.validate).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_ticket(self):
        try:
            return Ticket.objects.get(pk=self.kwargs['pk'])
        except Ticket.DoesNotExist:
            raise NotFound("Ticket not found.")

    def get_queryset(self):
        ticket = self.get_ticket()
        user = self.request.user

        is_owner = ticket.customer_id == user.id
        is_staff_or_admin = user.role in ('STAFF', 'ADMIN')

        if not (is_owner or is_staff_or_admin):
            raise PermissionDenied("You do not have permission to view this ticket's quotations.")

        return Quotation.objects.filter(ticket=ticket)

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return QuotationCreateSerializer
        return QuotationSerializer

    def create(self, request, *args, **kwargs):
        ticket = self.get_ticket()

        if request.user.role != 'STAFF':
            raise PermissionDenied("Only Staff can send a quotation.")

        serializer = self.get_serializer(data=request.data, context={'ticket': ticket, 'request': request})
        serializer.is_valid(raise_exception=True)
        quotation = serializer.save(ticket=ticket)

        return Response(
            QuotationSerializer(quotation).data,
            status=status.HTTP_201_CREATED,
        )