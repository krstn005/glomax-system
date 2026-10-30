"""
Builds the PDF documents as bytes, so the same code can be used by:
  - the Download buttons (finalsheet/views.py), and
  - the emails sent to the customer (tickets/utils.py).
One place for the PDF code means the download and the email always match.
"""
import io

from django.template.loader import render_to_string
from xhtml2pdf import pisa


def _render_pdf(html):
    """Turns HTML into PDF bytes. Returns None if it could not be made."""
    from .views import _pdf_link_callback

    buffer = io.BytesIO()
    result = pisa.CreatePDF(html, dest=buffer, link_callback=_pdf_link_callback)
    if result.err:
        return None
    return buffer.getvalue()


def build_final_sheet_pdf(ticket):
    """
    The Disclosure Agreement (Final Sheet) PDF.
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
        'approved_by_name': final_sheet.approved_by.username if final_sheet.approved_by else None,
        'payment_terms_lines': _format_payment_terms_lines(final_sheet.payment_terms_summary),
    })
    return _render_pdf(html)


def build_completion_certificate_pdf(ticket):
    """
    The Completion Certificate PDF. Returns the PDF bytes, or None if
    the PDF could not be made.
    """
    from .models import FinalSheet
    from .views import _find_logo_path

    final_sheet = FinalSheet.objects.filter(ticket=ticket).first()

    html = render_to_string('finalsheet/completion_certificate_pdf.html', {
        'logo_path': _find_logo_path(),
        'ticket': ticket,
        'final_sheet': final_sheet,
        'completion_photos': ticket.completion_photos.all(),
        'installer_name': ticket.partner_installer.username if ticket.partner_installer else None,
    })
    return _render_pdf(html)