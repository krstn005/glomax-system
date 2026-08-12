from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound

from tickets.models import Ticket
from .models import Feedback
from .serializers import FeedbackSerializer, FeedbackCreateSerializer
from accounts.permissions import IsCustomer


class TicketFeedbackView(APIView):
    """
    GET  /api/tickets/<id>/feedback/  - view the feedback for this
         ticket, if it exists. Allowed for the ticket's Customer,
         the assigned Partner Installer (My Ratings page), or
         Staff/Admin (Customer Feedback page).
    POST /api/tickets/<id>/feedback/  - Customer submits their rating
         and comment. Only allowed once the ticket is APPROVED.
         Matches the spec: "Feedback page is only accessible after
         ticket reaches Approved and Completed status."
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_ticket(self):
        try:
            return Ticket.objects.get(pk=self.kwargs['pk'])
        except Ticket.DoesNotExist:
            raise NotFound("Ticket not found.")

    def get(self, request, pk):
        ticket = self.get_ticket()
        user = request.user

        is_owner = ticket.customer_id == user.id
        is_assigned_installer = ticket.partner_installer_id == user.id
        is_staff_or_admin = user.role in ('STAFF', 'ADMIN')

        if not (is_owner or is_assigned_installer or is_staff_or_admin):
            raise PermissionDenied("You do not have permission to view this ticket's feedback.")

        feedback = getattr(ticket, 'feedback', None)
        if feedback is None:
            return Response(
                {"detail": "Feedback will be available once your request is completed."},
                status=404,
            )

        return Response(FeedbackSerializer(feedback).data)

    def post(self, request, pk):
        ticket = self.get_ticket()

        if ticket.customer_id != request.user.id:
            raise PermissionDenied("You can only submit feedback for your own ticket.")

        if ticket.status != Ticket.Status.APPROVED:
            return Response(
                {"detail": "Feedback will be available once your request is completed."},
                status=400,
            )

        if hasattr(ticket, 'feedback'):
            return Response(
                {"detail": "Feedback has already been submitted for this ticket."},
                status=400,
            )

        serializer = FeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feedback = serializer.save(ticket=ticket)

        return Response(
            FeedbackSerializer(feedback).data,
            status=status.HTTP_201_CREATED,
        )