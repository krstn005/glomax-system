from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import Ticket
from .serializers import (
    TicketCreateSerializer,
    TicketSerializer,
    TicketAssignSerializer,
    TicketDecisionSerializer,
)
from accounts.permissions import IsCustomer, IsAccountOwner, IsStaff, IsStaffOrAdmin


# --- Stage 1 views (unchanged) ---

class TicketListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tickets/  - list the logged-in Customer's own tickets
    POST /api/tickets/  - submit a new Schedule Request
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
    GET /api/tickets/<id>/  - view one ticket's full details.
    IsAccountOwner blocks a Customer from viewing a ticket that isn't
    theirs. NOTE: Staff/Admin also need to view any ticket - that's
    handled separately by StaffTicketListView / StaffTicketDetailView
    below rather than loosening this Customer-facing view.
    """
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsAccountOwner]


class TicketWithdrawView(APIView):
    """
    PATCH /api/tickets/<id>/withdraw/  - Withdraw button action.
    Only allowed while status is REQUEST_SUBMITTED (before a Partner
    Installer is assigned).
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


# --- Stage 2 views (Staff) ---

class StaffTicketListView(generics.ListAPIView):
    """
    GET /api/tickets/staff/  - Staff/Admin view of ALL tickets, not
    just one customer's (Incoming Requests / Ticket Progress pages).
    Optional ?status=STATUS_VALUE filter, e.g.
    /api/tickets/staff/?status=REQUEST_SUBMITTED
    """
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]

    def get_queryset(self):
        queryset = Ticket.objects.all().order_by('-created_at')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class TicketAssignView(APIView):
    """
    PATCH /api/tickets/<id>/assign/  - Assign Partner Installer page.
    Staff picks a Partner Installer + Visit Date. Moves status to
    PI_ASSIGNED. From this point on, the Customer's Withdraw button
    is hidden (enforced by TicketWithdrawView's status/assignment check).
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def patch(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        serializer = TicketAssignSerializer(data=request.data, context={'ticket': ticket})
        serializer.is_valid(raise_exception=True)

        ticket.partner_installer = serializer.validated_data['partner_installer']
        ticket.visit_date = serializer.validated_data['visit_date']
        ticket.status = Ticket.Status.PARTNER_INSTALLER_ASSIGNED
        ticket.assigned_at = timezone.now()
        ticket.save()

        # NOTE: SMS + in-system notification to the Partner Installer
        # is intentionally not implemented yet (Semaphore not purchased).

        return Response(TicketSerializer(ticket).data)


class TicketDecisionView(APIView):
    """
    PATCH /api/tickets/<id>/decision/  - Assessment Review page.
    Staff's decision after reviewing the Partner Installer's
    submitted assessment: Forward to Admin, Not Compatible (Cannot
    Proceed), or Not Compatible (Can Reapply).
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def patch(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        serializer = TicketDecisionSerializer(data=request.data, context={'ticket': ticket})
        serializer.is_valid(raise_exception=True)
        decision = serializer.validated_data['decision']

        if decision == 'FORWARD_TO_ADMIN':
            ticket.status = Ticket.Status.ADMIN_REVIEW
        elif decision == 'NOT_COMPATIBLE_CANNOT':
            ticket.status = Ticket.Status.NOT_COMPATIBLE_CANNOT_PROCEED
            ticket.completed_at = timezone.now()
        elif decision == 'NOT_COMPATIBLE_CAN_REAPPLY':
            ticket.status = Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY
            ticket.completed_at = timezone.now()

        ticket.save()

        return Response(TicketSerializer(ticket).data)