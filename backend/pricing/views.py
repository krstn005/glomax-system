from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from tickets.models import Ticket
from accounts.permissions import IsAdmin
from .models import Quotation, PaymentTerms, PriceHistory
from .serializers import (
    QuotationSerializer,
    QuotationCreateSerializer,
    PaymentTermsSerializer,
    PaymentTermsCreateSerializer,
    PriceHistorySerializer,
    PriceHistoryCreateSerializer,
)
from .utils import announce_price_change


class PaymentTermsListView(generics.ListCreateAPIView):
    """
    GET  /api/pricing/payment-terms/  - read-only list of all existing
         Payment Terms, newest first. Used to populate the dropdown on
         Staff's Updated Quotation form, and Admin's Payment Terms
         History page.
    POST /api/pricing/payment-terms/  - Admin's "+ Add New Term" form.
         Admin only.
    """
    queryset = PaymentTerms.objects.all()

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PaymentTermsCreateSerializer
        return PaymentTermsSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsAdmin()]
        return [permissions.IsAuthenticated()]


class PriceHistoryListView(generics.ListCreateAPIView):
    """
    GET  /api/pricing/price-history/  - read-only list of all Price
         History entries, newest first (model's default ordering).
         Staff's Active Prices page filters this down to
         is_active=True on the frontend; Admin's Price History page
         shows the full list.
    POST /api/pricing/price-history/  - Admin's "+ Add New Price"
         form. Admin only. Creating a new entry with is_active left
         at its default (True) automatically deactivates the previous
         entry for the same package_name (see PriceHistory.save()) -
         no extra logic needed here.

         If the new price is different from the package's previous
         active price, every customer gets a bell notification, and
         customers with Email Updates on also get an email (see
         pricing/utils.py). This never blocks or fails the save.
    """
    queryset = PriceHistory.objects.all()

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PriceHistoryCreateSerializer
        return PriceHistorySerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated(), IsAdmin()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        # Remember the price that is active right now (before the new
        # one replaces it), so we can tell what changed.
        package_name = serializer.validated_data.get('package_name')
        previous = PriceHistory.objects.filter(
            package_name=package_name, is_active=True
        ).first()
        old_price = previous.price if previous else None

        new_entry = serializer.save()

        if old_price is not None and old_price != new_entry.price:
            announce_price_change(old_price, new_entry)


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