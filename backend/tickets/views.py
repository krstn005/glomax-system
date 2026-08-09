from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Ticket
from .serializers import TicketCreateSerializer, TicketSerializer
from accounts.permissions import IsCustomer, IsAccountOwner


class TicketListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tickets/  - list the logged-in Customer's own tickets
                           (Customer Dashboard / History pages)
    POST /api/tickets/  - submit a new Schedule Request
                           (Submit Request Page). Always creates the
                           ticket with status REQUEST_SUBMITTED and
                           customer = the logged-in user.

    Customer-only for now (Stage 1). Staff's "list ALL tickets" view
    is a separate endpoint added in Stage 2, since the visibility
    rules are different (Staff sees everyone's, Customers see only
    their own).
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def get_queryset(self):
        return Ticket.objects.filter(customer=self.request.user).order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TicketCreateSerializer
        return TicketSerializer

    def perform_create(self, serializer):
        serializer.save(customer=self.request.user)

    def create(self, request, *args, **kwargs):
        # After creating, respond with the full TicketSerializer
        # representation (ticket_number, status, etc.) rather than
        # just echoing back the input fields. TicketCreateSerializer
        # only exposes the writable input fields, so there's no
        # 'id' in response.data to look up afterwards - instead,
        # grab the saved instance directly off the serializer.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        ticket = serializer.instance
        return Response(
            TicketSerializer(ticket).data,
            status=status.HTTP_201_CREATED,
        )


class TicketDetailView(generics.RetrieveAPIView):
    """
    GET /api/tickets/<id>/  - view one ticket's full details
                              (Request Status page).

    IsAccountOwner blocks a Customer from viewing a ticket that
    isn't theirs, even if they guess a valid ticket ID.
    """
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsAccountOwner]


class TicketWithdrawView(APIView):
    """
    PATCH /api/tickets/<id>/withdraw/  - Withdraw button action.

    Only allowed while status is still REQUEST_SUBMITTED and no
    Partner Installer has been assigned yet - matches the spec:
    "Withdraw button only shows before Partner Installer assigned;
    hidden after."
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def patch(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk, customer=request.user)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        if ticket.partner_installer is not None or ticket.status != Ticket.Status.REQUEST_SUBMITTED:
            return Response(
                {"detail": "This ticket can no longer be withdrawn."},
                status=400,
            )

        ticket.status = Ticket.Status.WITHDRAWN
        ticket.withdrawn_at = timezone.now()
        ticket.save()

        return Response(TicketSerializer(ticket).data)