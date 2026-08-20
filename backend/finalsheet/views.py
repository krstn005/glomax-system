from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound
from xhtml2pdf import pisa

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


def _pdf_link_callback(uri, rel):
    """
    xhtml2pdf needs local filesystem paths to embed images, not URLs -
    this resolves an uploaded photo's MEDIA_URL, or the company logo's
    static URL, into an absolute path on disk so both can actually
    render inside the PDF.

    TEMPORARY: print statements left in on purpose to debug why the
    logo specifically isn't resolving - remove once confirmed working.
    """
    import os
    from django.conf import settings
    from django.contrib.staticfiles import finders

    print(f"[PDF DEBUG] Incoming uri: {uri!r}")

    clean_uri = uri.lstrip("/")
    media_prefix = settings.MEDIA_URL.lstrip("/")
    static_prefix = settings.STATIC_URL.lstrip("/")

    print(f"[PDF DEBUG] clean_uri={clean_uri!r} media_prefix={media_prefix!r} static_prefix={static_prefix!r}")

    if clean_uri.startswith(media_prefix):
        relative_path = clean_uri[len(media_prefix):]
        path = os.path.join(settings.MEDIA_ROOT, relative_path)
        print(f"[PDF DEBUG] Matched MEDIA. Resolved path: {path!r}. Exists: {os.path.isfile(path)}")
        if os.path.isfile(path):
            return path

    if clean_uri.startswith(static_prefix):
        relative_path = clean_uri[len(static_prefix):]
        result = finders.find(relative_path)
        print(f"[PDF DEBUG] Matched STATIC. finders.find({relative_path!r}) = {result!r}")
        if result:
            return result

    print(f"[PDF DEBUG] No match - returning uri unchanged: {uri!r}")
    return uri


class FinalSheetPDFView(APIView):
    """
    GET /api/tickets/<id>/final-sheet/pdf/  - generates and returns a
    real PDF file of the Final Sheet, using xhtml2pdf to render the
    finalsheet/final_sheet_pdf.html template. Allowed for the ticket's
    own Customer, or Staff/Admin - matches who can already view the
    Final Sheet on-screen. 404 if the ticket has no Final Sheet yet
    (not approved).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            ticket = Ticket.objects.get(pk=pk)
        except Ticket.DoesNotExist:
            return HttpResponse("Ticket not found.", status=404)

        user = request.user
        is_owner = ticket.customer_id == user.id
        is_staff_or_admin = user.role in ('STAFF', 'ADMIN')
        if not (is_owner or is_staff_or_admin):
            return HttpResponse("You do not have permission to view this document.", status=403)

        final_sheet = getattr(ticket, 'final_sheet', None)
        if final_sheet is None:
            return HttpResponse("This ticket has not been approved yet.", status=404)

        assessment = getattr(ticket, 'assessment', None)
        initial_quotation = ticket.quotations.filter(quotation_type='INITIAL').first()
        updated_quotation = ticket.quotations.filter(quotation_type='UPDATED').order_by('-sent_at').first()
        photos = assessment.photos.all() if assessment else []

        html = render_to_string('finalsheet/final_sheet_pdf.html', {
            'ticket': ticket,
            'final_sheet': final_sheet,
            'assessment': assessment,
            'photos': photos,
            'initial_quotation': initial_quotation,
            'updated_quotation': updated_quotation,
            'installer_name': ticket.partner_installer.username if ticket.partner_installer else None,
            'approved_by_name': final_sheet.approved_by.username if final_sheet.approved_by else None,
        })

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{ticket.ticket_number}-final-sheet.pdf"'

        result = pisa.CreatePDF(html, dest=response, link_callback=_pdf_link_callback)
        if result.err:
            return HttpResponse("Could not generate PDF.", status=500)

        return response