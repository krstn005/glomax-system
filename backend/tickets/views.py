from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from .models import Ticket, CompletionPhoto, RescheduleRequest
from .quotation_linking import link_initial_quotation_to_ticket
from .serializers import (
    TicketCreateSerializer,
    TicketSerializer,
    TicketAssignSerializer,
    TicketDecisionSerializer,
    TicketApproveSerializer,
    TicketReturnForRevisionSerializer,
    RescheduleRequestCreateSerializer,
)
from accounts.permissions import (
    IsCustomer,
    IsAccountOwner,
    IsStaff,
    IsStaffOrAdmin,
    IsPartnerInstaller,
    IsAdmin,
)
from accounts.models import User
from notifications.models import Notification


# --- Stage 1 views (Customer) ---

class TicketListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/tickets/  - list the logged-in Customer's own tickets
    POST /api/tickets/  - submit a new Schedule Request. Blocked while
         the Customer already has an active (still in-progress)
         ticket.
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    RESOLVED_STATUSES = [
        Ticket.Status.APPROVED,
        Ticket.Status.COMPLETED,
        Ticket.Status.WITHDRAWN,
        Ticket.Status.NOT_COMPATIBLE_CANNOT_PROCEED,
        Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY,
    ]

    def get_queryset(self):
        return Ticket.objects.filter(customer=self.request.user).order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return TicketCreateSerializer
        return TicketSerializer

    def perform_create(self, serializer):
        serializer.save(customer=self.request.user)

    def create(self, request, *args, **kwargs):
        active_ticket = (
            Ticket.objects.filter(customer=request.user)
            .exclude(status__in=self.RESOLVED_STATUSES)
            .order_by('-created_at')
            .first()
        )
        if active_ticket:
            return Response(
                {
                    "detail": (
                        f"You already have an active request ({active_ticket.ticket_number}). "
                        "You can submit a new one once it's completed, withdrawn, or marked "
                        "Not Compatible."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

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
        sent via the Email Inquiries page, copy it onto this ticket
        now that it exists.
        """
        from inquiries.models import Inquiry

        inquiry = (
            Inquiry.objects.filter(
                email__iexact=ticket.customer.email,
                quotation_sent=True,
                subject=Inquiry.Subject.ROOF_ASSESSMENT,
            )
            .order_by('-quotation_sent_at')
            .first()
        )
        if inquiry:
            link_initial_quotation_to_ticket(ticket, inquiry)


class TicketDetailView(generics.RetrieveAPIView):
    """
    GET /api/tickets/<id>/  - view one ticket's full details.
    """
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsAccountOwner]


class TicketWithdrawView(APIView):
    """
    PATCH /api/tickets/<id>/withdraw/  - Withdraw button action.
    Only allowed while status is REQUEST_SUBMITTED.
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


class TicketRescheduleRequestView(APIView):
    """
    POST /api/tickets/<id>/reschedule/  - Customer's "Request
    Reschedule" button on the Request Status page. Only works on the
    Customer's own ticket, only while PI_ASSIGNED, and only if no
    PENDING request already exists. Notifies Staff so it shows up for
    them to Approve or Decline.
    """
    permission_classes = [permissions.IsAuthenticated, IsCustomer]

    def post(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk, customer=request.user)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        serializer = RescheduleRequestCreateSerializer(data=request.data, context={'ticket': ticket})
        serializer.is_valid(raise_exception=True)

        reschedule = RescheduleRequest.objects.create(
            ticket=ticket,
            requested_date=serializer.validated_data['requested_date'],
            reason=serializer.validated_data.get('reason', ''),
        )

        for staff_user in User.objects.filter(role='STAFF'):
            Notification.objects.create(
                recipient=staff_user,
                kind=Notification.Kind.RESCHEDULE_REQUESTED,
                message=f"{ticket.ticket_number}'s customer requested a new visit date.",
                link=f"/staff/manage-tickets/{ticket.id}",
            )

        return Response(TicketSerializer(ticket).data, status=status.HTTP_201_CREATED)


class TicketRescheduleDecisionView(APIView):
    """
    PATCH /api/tickets/<id>/reschedule/<reschedule_id>/  - Staff's
    Approve/Decline action on a pending reschedule request.
    """
    permission_classes = [permissions.IsAuthenticated, IsStaff]

    def patch(self, request, pk, reschedule_id):
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        try:
            reschedule = RescheduleRequest.objects.get(pk=reschedule_id, ticket=ticket)
        except RescheduleRequest.DoesNotExist:
            return Response({"detail": "Reschedule request not found."}, status=404)

        if reschedule.status != RescheduleRequest.Status.PENDING:
            return Response(
                {"detail": "This reschedule request has already been resolved."},
                status=400,
            )

        decision = request.data.get('decision')
        if decision not in ('APPROVE', 'DECLINE'):
            return Response({"detail": "decision must be APPROVE or DECLINE."}, status=400)

        reschedule.staff_response_note = request.data.get('staff_response_note', '')
        reschedule.resolved_at = timezone.now()

        if decision == 'APPROVE':
            reschedule.status = RescheduleRequest.Status.APPROVED
            ticket.visit_date = reschedule.requested_date
            ticket.save()
            message = (
                f"Your reschedule request for {ticket.ticket_number} was approved. "
                f"New visit date: {reschedule.requested_date.strftime('%B %d, %Y')}."
            )
        else:
            reschedule.status = RescheduleRequest.Status.DECLINED
            message = f"Your reschedule request for {ticket.ticket_number} was declined."

        reschedule.save()

        Notification.objects.create(
            recipient=ticket.customer,
            kind=Notification.Kind.RESCHEDULE_DECISION,
            message=message,
            link="/request-status",
        )

        return Response(TicketSerializer(ticket).data)


# --- Stage 2 views (Staff) ---

class OptionalPageNumberPagination(PageNumberPagination):
    """
    Only paginates when the request explicitly asks for a page (via
    ?page=N).
    """
    page_size = 20
    page_query_param = 'page'

    def paginate_queryset(self, queryset, request, view=None):
        if request.query_params.get(self.page_query_param) is None:
            return None
        return super().paginate_queryset(queryset, request, view)


class StaffTicketListView(generics.ListAPIView):
    """
    GET /api/tickets/staff/  - Staff/Admin view of ALL tickets.
    Supports ?status=, ?search=, ?has_assessment=, ?ordering=, ?page=
    all together.
    """
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsStaffOrAdmin]
    pagination_class = OptionalPageNumberPagination

    def get_queryset(self):
        queryset = Ticket.objects.all().order_by('-created_at')

        status_filter = self.request.query_params.get('status')
        if status_filter:
            status_list = [s.strip() for s in status_filter.split(',') if s.strip()]
            queryset = queryset.filter(status__in=status_list)

        has_assessment = self.request.query_params.get('has_assessment')
        if has_assessment == 'true':
            queryset = queryset.filter(assessment__isnull=False)

        search_term = self.request.query_params.get('search')
        if search_term:
            queryset = queryset.filter(
                Q(ticket_number__icontains=search_term) |
                Q(customer__username__icontains=search_term)
            )

        ordering = self.request.query_params.get('ordering')
        if ordering == 'oldest_assessment':
            queryset = queryset.order_by('assessment__submitted_at')

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

        Notification.objects.create(
            recipient=ticket.partner_installer,
            kind=Notification.Kind.TICKET_ASSIGNED,
            message=f"You've been assigned to {ticket.ticket_number}.",
            link=f"/partner-installer/incoming-tickets/{ticket.id}",
        )

        return Response(TicketSerializer(ticket).data)


class TicketDecisionView(APIView):
    """
    PATCH /api/tickets/<id>/decision/  - Assessment Review page.
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
            ticket.admin_revision_notes = None
            ticket.save()

            for admin_user in User.objects.filter(role='ADMIN'):
                Notification.objects.create(
                    recipient=admin_user,
                    kind=Notification.Kind.ADMIN_REVIEW_READY,
                    message=f"{ticket.ticket_number} is ready for your review.",
                    link=f"/admin/requests/{ticket.id}",
                )
        elif decision == 'NOT_COMPATIBLE_CANNOT':
            ticket.status = Ticket.Status.NOT_COMPATIBLE_CANNOT_PROCEED
            ticket.completed_at = timezone.now()
            ticket.save()

            Notification.objects.create(
                recipient=ticket.customer,
                kind=Notification.Kind.TICKET_DECISION,
                message=f"Your request {ticket.ticket_number} was marked as Not Compatible.",
                link="/request-status",
            )
        elif decision == 'NOT_COMPATIBLE_CAN_REAPPLY':
            ticket.status = Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY
            ticket.completed_at = timezone.now()
            ticket.save()

            Notification.objects.create(
                recipient=ticket.customer,
                kind=Notification.Kind.TICKET_DECISION,
                message=f"Your request {ticket.ticket_number} was marked as Not Compatible, but you can reapply.",
                link="/request-status",
            )
        else:
            ticket.save()

        return Response(TicketSerializer(ticket).data)


# --- Stage 3 views (Partner Installer) ---

class InstallerTicketListView(generics.ListAPIView):
    """
    GET /api/tickets/installer/  - tickets assigned to the logged-in
    Partner Installer.
    """
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsPartnerInstaller]

    def get_queryset(self):
        queryset = Ticket.objects.filter(partner_installer=self.request.user).order_by('-created_at')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class TicketCompleteView(APIView):
    """
    PATCH /api/tickets/<id>/complete/  - Partner Installer's "Mark
    Installation Complete" action.
    """
    permission_classes = [permissions.IsAuthenticated, IsPartnerInstaller]
    parser_classes = [MultiPartParser, FormParser]

    def patch(self, request, pk):
        from .utils import send_completion_email

        try:
            ticket = Ticket.objects.get(pk=pk, partner_installer=request.user)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found, or not assigned to you."}, status=404)

        if ticket.status != Ticket.Status.APPROVED:
            return Response(
                {"detail": "This ticket can only be marked complete while it's Approved."},
                status=400,
            )

        photos = request.FILES.getlist('photos')
        if not photos:
            return Response(
                {"detail": "Please attach at least one completion photo."},
                status=400,
            )

        for photo in photos:
            CompletionPhoto.objects.create(ticket=ticket, image=photo)

        ticket.status = Ticket.Status.COMPLETED
        ticket.completed_at = timezone.now()
        ticket.save()

        Notification.objects.create(
            recipient=ticket.customer,
            kind=Notification.Kind.INSTALLATION_COMPLETED,
            message=f"Your installation for {ticket.ticket_number} is complete!",
            link="/request-status",
        )

        send_completion_email(ticket)

        return Response(TicketSerializer(ticket).data)


# --- Stage 4 views (Admin) ---

class AdminTicketListView(generics.ListAPIView):
    """
    GET /api/tickets/admin/  - Admin's Pending Approval queue.
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
    Approve action.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def patch(self, request, pk):
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
        ticket.save()

        Notification.objects.create(
            recipient=ticket.customer,
            kind=Notification.Kind.TICKET_APPROVED,
            message=f"Your request {ticket.ticket_number} has been approved!",
            link="/request-status",
        )

        return Response(TicketSerializer(ticket).data, status=status.HTTP_201_CREATED)


class TicketReturnForRevisionView(APIView):
    """
    PATCH /api/tickets/<id>/return-for-revision/  - Pending Approval
    page's Return for Revision action.
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

        for staff_user in User.objects.filter(role='STAFF'):
            Notification.objects.create(
                recipient=staff_user,
                kind=Notification.Kind.TICKET_RETURNED,
                message=f"{ticket.ticket_number} was returned for revision by Admin.",
                link=f"/staff/manage-tickets/{ticket.id}",
            )

        return Response(TicketSerializer(ticket).data)