import re
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Ticket
from .serializers import (
    TicketCreateSerializer,
    TicketSerializer,
    TicketAssignSerializer,
    TicketDecisionSerializer,
    TicketApproveSerializer,
    TicketReturnForRevisionSerializer,
)
from accounts.permissions import (
    IsCustomer,
    IsAccountOwner,
    IsStaff,
    IsStaffOrAdmin,
    IsPartnerInstaller,
    IsAdmin,
)


def _parse_cost_text(raw_text):
    """
    Converts a free-text cost string (e.g. "P250,000", "250000.50")
    into a Decimal, or returns None if it can't be parsed. Used when
    auto-linking an Inquiry's Initial Quotation to a new Ticket, since
    Inquiry.quotation_estimated_cost is free text but
    pricing.Quotation.estimated_cost is a strict DecimalField.
    """
    if not raw_text:
        return None
    cleaned = re.sub(r'[^\d.]', '', raw_text)
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


# --- Stage 1 views (Customer) ---

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

        self._link_initial_quotation(ticket)

        return Response(
            TicketSerializer(ticket).data,
            status=status.HTTP_201_CREATED,
        )

    def _link_initial_quotation(self, ticket):
        """
        If this ticket's Customer previously submitted a public
        Inquiry (same email) that already had an Initial Quotation
        sent via the Email Inquiries page, copy that quotation into a
        real pricing.Quotation record now that a ticket exists to
        attach it to. Matches the Quotation Management spec: the
        system automatically links the Initial Quotation to the ticket
        once the customer registers/applies with the same email used
        in their inquiry.

        Silently does nothing if there's no matching inquiry, if this
        ticket already has an Initial Quotation, or if the stored cost
        text can't be parsed - a failed auto-link should never block
        the customer's ticket from being created.
        """
        # Local imports avoid circular imports at module load time.
        from inquiries.models import Inquiry
        from pricing.models import Quotation, PaymentTerms

        if Quotation.objects.filter(ticket=ticket, quotation_type='INITIAL').exists():
            return

        inquiry = (
            Inquiry.objects.filter(
                email__iexact=ticket.customer.email,
                quotation_sent=True,
                subject=Inquiry.Subject.ROOF_ASSESSMENT,
            )
            .order_by('-quotation_sent_at')
            .first()
        )
        if not inquiry:
            return

        cost = _parse_cost_text(inquiry.quotation_estimated_cost)
        if cost is None:
            return

        payment_terms = None
        if inquiry.quotation_payment_terms:
            payment_terms, _ = PaymentTerms.objects.get_or_create(
                description=inquiry.quotation_payment_terms
            )

        Quotation.objects.create(
            ticket=ticket,
            quotation_type='INITIAL',
            package_details=inquiry.quotation_package_details or '',
            estimated_cost=cost,
            payment_terms=payment_terms,
            notes=inquiry.quotation_message_to_customer or '',
        )


class TicketDetailView(generics.RetrieveAPIView):
    """
    GET /api/tickets/<id>/  - view one ticket's full details.
    IsAccountOwner blocks a Customer from viewing a ticket that isn't
    theirs. Staff/Admin/Partner Installer use the role-scoped list
    views below instead of this Customer-facing one.
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
    GET /api/tickets/staff/  - Staff/Admin view of ALL tickets.
    Optional ?status=STATUS_VALUE filter.
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
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def patch(self, request, pk):
        from .utils import send_assignment_email

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

        send_assignment_email(ticket)

        return Response(TicketSerializer(ticket).data)


class TicketDecisionView(APIView):
    """
    PATCH /api/tickets/<id>/decision/  - Assessment Review page.
    Staff's decision: Forward to Admin, Not Compatible (Cannot
    Proceed), or Not Compatible (Can Reapply). Also handles
    resubmission after an Admin Return for Revision (ticket comes
    back in STAFF_REVIEW status).
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
            # Clear old revision notes once resubmitted so the
            # Admin isn't looking at stale feedback on the next review.
            ticket.admin_revision_notes = None
        elif decision == 'NOT_COMPATIBLE_CANNOT':
            ticket.status = Ticket.Status.NOT_COMPATIBLE_CANNOT_PROCEED
            ticket.completed_at = timezone.now()
        elif decision == 'NOT_COMPATIBLE_CAN_REAPPLY':
            ticket.status = Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY
            ticket.completed_at = timezone.now()

        ticket.save()

        return Response(TicketSerializer(ticket).data)


# --- Stage 3 views (Partner Installer) ---

class InstallerTicketListView(generics.ListAPIView):
    """
    GET /api/tickets/installer/  - tickets assigned to the logged-in
    Partner Installer. Optional ?status=STATUS_VALUE filter.
    """
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsPartnerInstaller]

    def get_queryset(self):
        queryset = Ticket.objects.filter(partner_installer=self.request.user).order_by('-created_at')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


# --- Stage 4 views (Admin) ---

class AdminTicketListView(generics.ListAPIView):
    """
    GET /api/tickets/admin/  - Admin's Pending Approval queue (and
    general ticket visibility). Optional ?status=STATUS_VALUE filter,
    e.g. /api/tickets/admin/?status=ADMIN_REVIEW
    """
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get_queryset(self):
        queryset = Ticket.objects.all().order_by('-created_at')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class TicketApproveView(APIView):
    """
    PATCH /api/tickets/<id>/approve/  - Pending Approval page's
    Approve action. Creates the FinalSheet snapshot and moves the
    ticket to APPROVED + COMPLETED.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        # Local import avoids a circular import at module load time
        # (finalsheet.models imports Ticket already).
        from finalsheet.models import FinalSheet

        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        serializer = TicketApproveSerializer(data=request.data, context={'ticket': ticket})
        serializer.is_valid(raise_exception=True)

        FinalSheet.objects.create(
            ticket=ticket,
            approved_by=request.user,
            final_cost=serializer.validated_data['final_cost'],
            payment_terms_summary=serializer.validated_data['payment_terms_summary'],
        )

        ticket.status = Ticket.Status.APPROVED
        ticket.completed_at = timezone.now()
        ticket.save()

        # NOTE: SMS + email to the Customer with the Final Sheet
        # attached is intentionally not implemented yet (Semaphore
        # not purchased, email notifications not yet built).

        return Response(TicketSerializer(ticket).data, status=status.HTTP_201_CREATED)


class TicketReturnForRevisionView(APIView):
    """
    PATCH /api/tickets/<id>/return-for-revision/  - Pending Approval
    page's Return for Revision action. Sends the ticket back to Staff
    with notes, moving status to STAFF_REVIEW so it reappears on
    Staff's Assessment Review page for adjustment + resubmission.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        serializer = TicketReturnForRevisionSerializer(data=request.data, context={'ticket': ticket})
        serializer.is_valid(raise_exception=True)

        ticket.status = Ticket.Status.STAFF_REVIEW
        ticket.admin_revision_notes = serializer.validated_data['notes']
        ticket.save()

        return Response(TicketSerializer(ticket).data)