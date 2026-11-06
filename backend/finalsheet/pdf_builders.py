"""
Builds the PDF documents as bytes, so the same code can be used by:
  - the Download buttons (finalsheet/views.py), and
  - the emails sent to the customer (tickets/utils.py).
One place for the PDF code means the download and the email always match.
"""
import io
from zoneinfo import ZoneInfo

from django.template.loader import render_to_string
from django.utils import timezone
from xhtml2pdf import pisa

# The Final Sheet always shows Philippine time, whatever the server uses
PH_TIME = ZoneInfo('Asia/Manila')


def _render_pdf(html):
    """Turns HTML into PDF bytes. Returns None if it could not be made."""
    from .views import _pdf_link_callback

    buffer = io.BytesIO()
    result = pisa.CreatePDF(html, dest=buffer, link_callback=_pdf_link_callback)
    if result.err:
        return None
    return buffer.getvalue()


def _person_name(user):
    """A person's real name if we have it, otherwise their username."""
    if user is None:
        return None
    full_name = (getattr(user, 'full_name', '') or '').strip()
    if not full_name and hasattr(user, 'get_full_name'):
        full_name = (user.get_full_name() or '').strip()
    return full_name or user.username


def _ph_date_time(value):
    """November 6, 2026, 7:50 PM PHT (Philippine time). Empty text if no date."""
    if not value:
        return ''
    local = value.astimezone(PH_TIME)
    hour = local.hour % 12 or 12
    am_pm = 'AM' if local.hour < 12 else 'PM'
    return f"{local.strftime('%B')} {local.day}, {local.year}, {hour}:{local.minute:02d} {am_pm} PHT"


def build_final_sheet_pdf(ticket, generated_by=None):
    """
    The Disclosure Agreement (Final Sheet) PDF.
    generated_by is the person who asked for this PDF (the Download
    button). Left empty, it is shown as made by the Glomax system
    (the email sent when the request is approved).
    Returns the PDF bytes, or None if the ticket has no Final Sheet yet
    or the PDF could not be made.
    """
    from .models import FinalSheet
    from .views import _find_logo_path, _format_payment_terms_lines

    # Looked up fresh, so a Final Sheet made a moment ago is always found
    final_sheet = FinalSheet.objects.filter(ticket=ticket).first()
    if final_sheet is None:
        return None

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
        # Who approved it (the Admin) and when, in Philippine time
        'approved_by_name': _person_name(final_sheet.approved_by),
        'approved_at_text': _ph_date_time(final_sheet.approved_at),
        # When this PDF was made, and by whom
        'generated_at_text': _ph_date_time(timezone.now()),
        'generated_by_name': _person_name(generated_by) or 'Glomax system',
        'payment_terms_lines': _format_payment_terms_lines(final_sheet.payment_terms_summary),
    })
    return _render_pdf(html)