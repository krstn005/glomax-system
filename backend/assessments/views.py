from django.shortcuts import render
from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from tickets.models import Ticket
from accounts.permissions import IsPartnerInstaller, IsAssignedPartnerInstaller
from accounts.models import User
from notifications.models import Notification
from .serializers import AssessmentCreateSerializer


class AssessmentSubmitView(APIView):
    """
    POST /api/assessments/tickets/<id>/submit/

    The Partner Installer's "Review and Submit" action on the
    Assessment Sheet page. Sent as multipart/form-data since it
    includes 1-2 Proof of Visit Photos.

    Only works while the ticket is still PARTNER_INSTALLER_ASSIGNED
    (enforced again in the serializer) and only by the Partner
    Installer this ticket is actually assigned to - not any other PI.
    On success, moves the ticket to ASSESSMENT_SUBMITTED so it appears
    on Staff's Assessment Review page next, and notifies every Staff
    account so it shows up on their Dashboard/notification bell too.
    """
    permission_classes = [permissions.IsAuthenticated, IsPartnerInstaller, IsAssignedPartnerInstaller]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return Response({"detail": "Ticket not found."}, status=404)

        self.check_object_permissions(request, ticket)

        if hasattr(ticket, 'assessment'):
            return Response(
                {"detail": "An assessment has already been submitted for this ticket."},
                status=400,
            )

        serializer = AssessmentCreateSerializer(
            data=request.data,
            context={'ticket': ticket, 'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        ticket.status = Ticket.Status.ASSESSMENT_SUBMITTED
        ticket.save()

        for staff_user in User.objects.filter(role='STAFF'):
            Notification.objects.create(
                recipient=staff_user,
                kind=Notification.Kind.ASSESSMENT_SUBMITTED,
                message=f"{ticket.ticket_number}'s assessment is ready for your review.",
                link=f"/staff/assessment-review/{ticket.id}",
            )

        from tickets.serializers import TicketSerializer
        return Response(TicketSerializer(ticket).data, status=status.HTTP_201_CREATED)