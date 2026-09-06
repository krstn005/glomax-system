from django.http import HttpResponse
from django.template.loader import render_to_string
from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, NotFound
from xhtml2pdf import pisa

from django.utils import timezone
from tickets.models import Ticket
from .models import Feedback
from .serializers import FeedbackSerializer, FeedbackCreateSerializer
from accounts.permissions import IsCustomer, IsAdmin

class TicketFeedbackView(APIView):
    """
    GET  /api/tickets/<id>/feedback/  - view the feedback for this
         ticket, if it exists. Allowed for the ticket's Customer,
         the assigned Partner Installer (My Ratings page), or
         Staff/Admin (Customer Feedback page).
    POST /api/tickets/<id>/feedback/  - Customer submits their rating
         and comment. Allowed once the ticket is APPROVED or
         COMPLETED - originally this only allowed APPROVED, but once
         the real COMPLETED status was introduced, an installation
         that actually finished would silently fall OUT of the
         eligible window instead of staying eligible, since COMPLETED
         comes after APPROVED chronologically. Notifies the assigned
         Partner Installer once feedback comes in, since it's their
         work being rated.
    """
    permission_classes = [permissions.IsAuthenticated]

    ELIGIBLE_STATUSES = (Ticket.Status.APPROVED, Ticket.Status.COMPLETED)

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

        if ticket.status not in self.ELIGIBLE_STATUSES:
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

        if ticket.partner_installer_id:
            from notifications.models import Notification
            Notification.objects.create(
                recipient=ticket.partner_installer,
                kind=Notification.Kind.FEEDBACK_SUBMITTED,
                message=f"You received a {feedback.rating}-star review for {ticket.ticket_number}.",
                link="/partner-installer/my-ratings",
            )

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
    """
    import os
    from django.conf import settings
    from django.contrib.staticfiles import finders

    clean_uri = uri.lstrip("/")
    media_prefix = settings.MEDIA_URL.lstrip("/")
    static_prefix = settings.STATIC_URL.lstrip("/")

    if clean_uri.startswith(media_prefix):
        relative_path = clean_uri[len(media_prefix):]
        path = os.path.join(settings.MEDIA_ROOT, relative_path)
        if os.path.isfile(path):
            return path

    if clean_uri.startswith(static_prefix):
        relative_path = clean_uri[len(static_prefix):]
        result = finders.find(relative_path)
        if result:
            return result

    return uri


def _format_payment_terms_lines(text):
    """
    Splits a comma-separated payment terms string into a list of
    segments, e.g. "50% downpayment, 50% upon completion" ->
    ["50% downpayment", "50% upon completion"]. Each segment is
    rendered on its own line in the PDF (rather than joined with " | "
    and left to wrap wherever the renderer runs out of width), so a
    term never breaks mid-phrase across a line.
    """
    if not text:
        return []
    return [p.strip() for p in text.split(",") if p.strip()]


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
            'payment_terms_lines': _format_payment_terms_lines(final_sheet.payment_terms_summary),
        })

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{ticket.ticket_number}-final-sheet.pdf"'

        result = pisa.CreatePDF(html, dest=response, link_callback=_pdf_link_callback)
        if result.err:
            return HttpResponse("Could not generate PDF.", status=500)

        return response


class CompletionCertificatePDFView(APIView):
    """
    GET /api/tickets/<id>/completion-certificate/pdf/  - generates and
    returns a PDF "certificate" confirming the installation was
    completed, using xhtml2pdf to render the
    finalsheet/completion_certificate_pdf.html template. Allowed for
    the ticket's own Customer, or Staff/Admin - same access rule as
    the Final Sheet PDF. 404 if the ticket hasn't actually reached
    COMPLETED status yet.
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

        if ticket.status != Ticket.Status.COMPLETED:
            return HttpResponse("This ticket has not been marked complete yet.", status=404)

        final_sheet = getattr(ticket, 'final_sheet', None)
        completion_photos = ticket.completion_photos.all()

        html = render_to_string('finalsheet/completion_certificate_pdf.html', {
            'ticket': ticket,
            'final_sheet': final_sheet,
            'completion_photos': completion_photos,
            'installer_name': ticket.partner_installer.username if ticket.partner_installer else None,
        })

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{ticket.ticket_number}-completion-certificate.pdf"'

        result = pisa.CreatePDF(html, dest=response, link_callback=_pdf_link_callback)
        if result.err:
            return HttpResponse("Could not generate PDF.", status=500)

        return response


class AdminReportsPDFView(APIView):
    """
    GET /api/tickets/reports/pdf/  - generates a PDF export of the
    Reports & Analytics page's stats (Admin only). Computes the same
    numbers the frontend page already shows, server-side, so the PDF
    and the on-screen page never disagree.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def get(self, request):
        from accounts.models import User

        tickets = Ticket.objects.all()

        total_requests = tickets.count()
        completed_installations = tickets.filter(status='COMPLETED').count()

        total_revenue = sum(
            (t.final_sheet.final_cost for t in tickets if hasattr(t, 'final_sheet')),
            start=0,
        )

        rated_tickets = [t for t in tickets if hasattr(t, 'feedback')]
        avg_rating = (
            round(sum(t.feedback.rating for t in rated_tickets) / len(rated_tickets), 1)
            if rated_tickets else 0.0
        )

        status_groups = [
            ('Pending', ['REQUEST_SUBMITTED']),
            ('Under Assessment', ['PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW']),
            ('Approved', ['APPROVED']),
            ('Rejected', ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY']),
            ('Completed', ['COMPLETED']),
            ('Withdrawn', ['WITHDRAWN']),
        ]
        status_breakdown = [
            {'label': label, 'count': tickets.filter(status__in=statuses).count()}
            for label, statuses in status_groups
        ]

        workers = User.objects.filter(role='PARTNER_INSTALLER')
        worker_performance = [
            {
                'username': w.username,
                'completed': tickets.filter(partner_installer=w, status='COMPLETED').count(),
                'is_active': w.is_active,
            }
            for w in workers
        ]

        html = render_to_string('finalsheet/reports_pdf.html', {
            'generated_on': timezone.now().strftime('%B %d, %Y'),
            'total_requests': total_requests,
            'completed_installations': completed_installations,
            'total_revenue': f'{total_revenue:,.2f}',
            'avg_rating': avg_rating,
            'status_breakdown': status_breakdown,
            'worker_performance': worker_performance,
        })

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = 'attachment; filename="glomax-reports.pdf"'

        result = pisa.CreatePDF(html, dest=response)
        if result.err:
            return HttpResponse("Could not generate PDF.", status=500)

        return response