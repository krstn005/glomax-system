import os
from datetime import date
from decimal import Decimal

from django.apps import apps
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
    from django.conf import settings
    from django.contrib.staticfiles import finders

    # Already a real file on disk (like the logo path we pass in)
    if os.path.isfile(uri):
        return uri

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


# Logo file names to look for, in order
LOGO_NAMES = [
    'GLOMAX_LOGO.png',
    'glomax_logo.png',
    'logo.png',
    'logo.jpg',
]


def _find_logo_path():
    """
    Finds the company logo on disk. Checks the finalsheet app's
    templates/finalsheet/ folder first (where GLOMAX_LOGO.png is kept),
    then its static folder, then any static folder Django knows about.
    Returns None if no logo is found, and the PDF just skips it.
    """
    from django.contrib.staticfiles import finders

    try:
        app_path = apps.get_app_config('finalsheet').path
    except LookupError:
        app_path = None

    if app_path:
        folders = [
            os.path.join(app_path, 'templates', 'finalsheet'),
            os.path.join(app_path, 'static'),
            os.path.join(app_path, 'static', 'images'),
            os.path.join(app_path, 'static', 'finalsheet'),
        ]
        for folder in folders:
            for name in LOGO_NAMES:
                path = os.path.join(folder, name)
                if os.path.isfile(path):
                    return path

    for name in LOGO_NAMES:
        for candidate in (name, f'images/{name}', f'finalsheet/{name}'):
            found = finders.find(candidate)
            if found:
                return found[0] if isinstance(found, (list, tuple)) else found

    return None


def _peso(amount):
    """xhtml2pdf's built-in fonts have no peso sign, so 'PHP' is used instead."""
    return f'PHP {amount:,.2f}'


def _local(dt):
    """Converts a date/time to local time when it has a timezone."""
    if dt and timezone.is_aware(dt):
        return timezone.localtime(dt)
    return dt


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

        # Customer's real name if we have it, otherwise their username
        customer = ticket.customer
        customer_name = (
            (getattr(ticket, 'full_name', '') or '').strip()
            or (customer.get_full_name() or '').strip()
            or customer.username
        )

        html = render_to_string('finalsheet/final_sheet_pdf.html', {
            'logo_path': _find_logo_path(),
            'customer_name': customer_name,
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
    Reports & Analytics page (Admin only). Works out the same numbers
    the frontend page shows, so the PDF and the screen match:
    revenue only counts COMPLETED installations, and approved jobs
    that aren't installed yet are shown separately as "waiting".
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    STATUS_GROUPS = [
        ('New Requests', ['REQUEST_SUBMITTED'], '#f59e0b'),
        ('Under Assessment', ['PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW'], '#3b82f6'),
        ('Approved', ['APPROVED'], '#22c55e'),
        ('Completed', ['COMPLETED'], '#eab308'),
        ('Not Compatible', ['NC_CANNOT_PROCEED', 'NC_CAN_REAPPLY'], '#ef4444'),
        ('Withdrawn', ['WITHDRAWN'], '#94a3b8'),
    ]

    # Tickets an installer is still working on
    WORKER_ACTIVE = ['PI_ASSIGNED', 'ASSESSMENT_SUBMITTED', 'STAFF_REVIEW', 'ADMIN_REVIEW', 'APPROVED']

    def get(self, request):
        from accounts.models import User

        tickets = list(Ticket.objects.all())
        total = len(tickets)

        def final_cost(t):
            sheet = getattr(t, 'final_sheet', None)
            return Decimal(sheet.final_cost or 0) if sheet else Decimal('0')

        def rating(t):
            fb = getattr(t, 'feedback', None)
            return fb.rating if fb and fb.rating else None

        completed = [t for t in tickets if t.status == 'COMPLETED']
        approved = [t for t in tickets if t.status == 'APPROVED']

        earned = sum((final_cost(t) for t in completed), Decimal('0'))
        waiting = sum((final_cost(t) for t in approved), Decimal('0'))

        ratings = [r for r in (rating(t) for t in tickets) if r]
        avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0.0
        completion_rate = round(len(completed) * 100 / total) if total else 0

        # Status breakdown
        status_breakdown = []
        for label, statuses, color in self.STATUS_GROUPS:
            count = sum(1 for t in tickets if t.status in statuses)
            pct = round(count * 100 / total) if total else 0
            status_breakdown.append({
                'label': label,
                'count': count,
                'pct': pct,
                'rest': 100 - pct,
                'color': color,
            })

        # Last 6 months
        now = timezone.localtime()
        months = []
        for i in range(5, -1, -1):
            month = now.month - i
            year = now.year
            while month <= 0:
                month += 12
                year -= 1
            months.append({
                'year': year,
                'month': month,
                'label': date(year, month, 1).strftime('%b %Y'),
                'requests': 0,
                'completed': 0,
                'revenue_value': Decimal('0'),
            })

        for t in tickets:
            created = _local(getattr(t, 'created_at', None))
            if created:
                for m in months:
                    if m['year'] == created.year and m['month'] == created.month:
                        m['requests'] += 1
            if t.status == 'COMPLETED':
                done = _local(getattr(t, 'completed_at', None) or getattr(t, 'updated_at', None))
                if done:
                    for m in months:
                        if m['year'] == done.year and m['month'] == done.month:
                            m['completed'] += 1
                            m['revenue_value'] += final_cost(t)

        for m in months:
            m['revenue'] = _peso(m['revenue_value']) if m['revenue_value'] else '-'

        # Popular packages
        package_counts = {}
        for t in tickets:
            name = (getattr(t, 'solar_package', '') or '').strip()
            if name:
                package_counts[name] = package_counts.get(name, 0) + 1
        packages = [
            {
                'rank': i + 1,
                'name': name,
                'count': count,
                'pct': round(count * 100 / total) if total else 0,
            }
            for i, (name, count) in enumerate(
                sorted(package_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            )
        ]

        # Installer performance
        worker_performance = []
        for w in User.objects.filter(role='PARTNER_INSTALLER'):
            mine = [t for t in tickets if t.partner_installer_id == w.id]
            mine_ratings = [r for r in (rating(t) for t in mine) if r]
            full_name = (getattr(w, 'full_name', '') or w.get_full_name() or '').strip()
            worker_performance.append({
                'name': full_name or w.username,
                'username': w.username,
                'assigned': len(mine),
                'active': sum(1 for t in mine if t.status in self.WORKER_ACTIVE),
                'completed': sum(1 for t in mine if t.status == 'COMPLETED'),
                'avg_rating': round(sum(mine_ratings) / len(mine_ratings), 1) if mine_ratings else None,
                'review_count': len(mine_ratings),
                'is_active': w.is_active,
            })
        worker_performance.sort(key=lambda w: (w['completed'], w['assigned']), reverse=True)

        html = render_to_string('finalsheet/reports_pdf.html', {
            'logo_path': _find_logo_path(),
            'generated_on': now.strftime('%B %d, %Y at %I:%M %p'),
            'total_requests': total,
            'completed_installations': len(completed),
            'completion_rate': completion_rate,
            'total_revenue': _peso(earned),
            'waiting_revenue': _peso(waiting) if waiting else None,
            'avg_rating': avg_rating,
            'review_count': len(ratings),
            'status_breakdown': status_breakdown,
            'months': months,
            'packages': packages,
            'worker_performance': worker_performance,
        })

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="glomax-reports-{now.strftime("%Y-%m-%d")}.pdf"'
        )

        result = pisa.CreatePDF(
            html,
            dest=response,
            link_callback=_pdf_link_callback,
            encoding='utf-8',
        )
        if result.err:
            return HttpResponse("Could not generate PDF.", status=500)

        return response