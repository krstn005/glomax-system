from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from tickets.models import Ticket
from .models import Quotation
from .serializers import QuotationSerializer, QuotationCreateSerializer


class TicketQuotationListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tickets/<id>/quotations/  - list all quotations sent for
         this ticket (oldest first is reversed by model ordering, so
         this naturally shows newest first - matches "Initial" then
         later "Updated" quotations appearing as they're sent).
         Allowed for: the ticket's own Customer, or Staff/Admin.
    POST /api/tickets/<id>/quotations/  - send a new quotation for this
         ticket (Initial or Updated). Staff only.
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

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        quotation = serializer.save(ticket=ticket)

        return Response(
            QuotationSerializer(quotation).data,
            status=status.HTTP_201_CREATED,
        )