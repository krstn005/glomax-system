import logging
import os
from email.mime.image import MIMEImage
from urllib.parse import urljoin

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, send_mail
from django.utils.html import escape

logger = logging.getLogger(__name__)


def send_assignment_email(ticket):
    """
    Notifies the assigned Partner Installer by email once Staff assigns
    them to a ticket. Uses the same Resend setup as the Initial
    Quotation email. Failures here are logged but never block the
    assignment itself from succeeding - a missed notification email
    shouldn't undo a real ticket update.
    """
    installer = ticket.partner_installer
    if not installer or not installer.email:
        return

    subject = f"New Assignment: {ticket.ticket_number}"

    message = (
        f"Hi {installer.username},\n\n"
        f"You have been assigned a new roof assessment visit.\n\n"
        f"Ticket #: {ticket.ticket_number}\n"
        f"Property Address: {ticket.property_address}\n"
        f"Contact Number: {ticket.contact_number}\n"
        f"Visit Date: {ticket.visit_date.strftime('%B %d, %Y') if ticket.visit_date else 'TBD'}\n\n"
        "Please log in to the Partner Installer Portal for full details.\n\n"
        "Best regards,\nGlomax Solar Enterprises"
    )

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[installer.email],
            fail_silently=True,
        )
    except Exception:
        # Assignment already succeeded in the database by the time
        # this runs - a broken email send should not surface as an
        # error to Staff or roll back the assignment.
        pass


# ---------------------------------------------------------------------
# Emails to the Customer (with PDF)
# ---------------------------------------------------------------------
# These three emails go out when the final result of a request is known:
#   - Approved             -> Disclosure Agreement PDF attached
#   - Not Compatible       -> short explanation, no PDF
#   - Completed            -> Completion Certificate PDF attached
# Each one returns True if the email was sent, and False if not (no
# email address, or sending failed). A failed email is written to the
# server log, but it never undoes the ticket update that already
# happened.

LOGO_PATH = os.path.join(settings.BASE_DIR, 'finalsheet', 'static', 'finalsheet', 'logo.jpg')


def _portal_link(path):
    base = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173')
    return urljoin(base.rstrip('/') + '/', path.lstrip('/'))


def _customer_name(ticket):
    customer = ticket.customer
    return (
        (getattr(ticket, 'full_name', '') or '').strip()
        or (customer.get_full_name() or '').strip()
        or customer.username
    )


def _email_html(heading, paragraphs, rows, button_text, button_link, attachment_note=None):
    """The same navy and gold look as the other Glomax emails."""
    paragraph_html = ''.join(
        f'<p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:1.6;">{escape(p)}</p>'
        for p in paragraphs
    )
    rows_html = ''.join(
        f'<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:38%;">{escape(label)}</td>'
        f'<td style="padding:6px 0;color:#0d1f3c;font-size:13px;font-weight:bold;">{escape(value)}</td></tr>'
        for label, value in rows
    )
    note_html = (
        f'<p style="margin:0 0 18px;padding:10px 12px;border-radius:8px;background:#fffbeb;'
        f'border:1px solid #fde68a;color:#854d0e;font-size:13px;line-height:1.5;">{escape(attachment_note)}</p>'
        if attachment_note else ''
    )
    return f"""
    <div style="background-color:#f3f4f6;padding:32px 16px;font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr>
          <td style="background-color:#0d1f3c;padding:20px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="cid:glomax_logo" width="32" height="32" style="display:block;border-radius:6px;" />
                </td>
                <td style="vertical-align:middle;">
                  <span style="color:#ffffff;font-size:17px;font-weight:bold;">Glomax Solar Enterprises</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 14px;color:#0d1f3c;font-size:20px;">{escape(heading)}</h2>
            {paragraph_html}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-top:1px solid #f1f3f6;border-bottom:1px solid #f1f3f6;">
              {rows_html}
            </table>
            {note_html}
            <div style="text-align:center;margin:0 0 8px;">
              <a href="{button_link}" style="display:inline-block;background-color:#facc15;color:#0d1f3c;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:10px;">
                {escape(button_text)}
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #f1f3f6;">
            <p style="margin:0;color:#9ca3af;font-size:11.5px;">
              This is an automated message from Glomax Solar Enterprises. Please do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </div>
    """


def _send_customer_email(ticket, subject, plain, html, pdf_files=()):
    """
    Sends one email to the Customer. pdf_files is a list of
    (file name, PDF bytes). Returns True if sent, False if not.
    """
    customer = ticket.customer
    if not customer or not customer.email:
        logger.info("No email on file for the customer of %s - email skipped.", ticket.ticket_number)
        return False

    try:
        email = EmailMultiAlternatives(
            subject=subject,
            body=plain,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[customer.email],
        )
        email.attach_alternative(html, 'text/html')

        try:
            with open(LOGO_PATH, 'rb') as f:
                logo = MIMEImage(f.read())
                logo.add_header('Content-ID', '<glomax_logo>')
                logo.add_header('Content-Disposition', 'inline', filename='logo.jpg')
                email.attach(logo)
        except FileNotFoundError:
            pass  # the email still goes out without the logo

        for filename, content in pdf_files:
            email.attach(filename, content, 'application/pdf')

        email.send()
        return True
    except Exception:
        logger.exception("Could not send the email for %s", ticket.ticket_number)
        return False


def send_approval_email(ticket):
    """
    Customer's request was approved by the Admin. Sends the Disclosure
    Agreement PDF. If the PDF can't be made, the email still goes out
    and tells the customer to download it from the portal.
    """
    from finalsheet.models import FinalSheet
    from finalsheet.pdf_builders import build_final_sheet_pdf

    try:
        pdf = build_final_sheet_pdf(ticket)
    except Exception:
        logger.exception("Could not make the Disclosure Agreement PDF for %s", ticket.ticket_number)
        pdf = None

    final_sheet = FinalSheet.objects.filter(ticket=ticket).first()
    name = _customer_name(ticket)
    link = _portal_link('/request-status')

    rows = [('Ticket #', ticket.ticket_number), ('Property Address', ticket.property_address)]
    if final_sheet and final_sheet.final_cost is not None:
        rows.append(('Final Cost', f'PHP {final_sheet.final_cost:,.2f}'))

    if pdf:
        note = 'Your Disclosure Agreement is attached to this email as a PDF. Please read it carefully.'
        files = [(f'{ticket.ticket_number}-disclosure-agreement.pdf', pdf)]
    else:
        note = 'You can download your Disclosure Agreement anytime from Request Status in the Customer Portal.'
        files = []

    paragraphs = [
        f'Hi {name},',
        'Good news! Your roof assessment was reviewed and your request has been approved.',
    ]

    plain = (
        f"Hi {name},\n\n"
        "Good news! Your roof assessment was reviewed and your request has been approved.\n\n"
        + ''.join(f"{label}: {value}\n" for label, value in rows)
        + f"\n{note}\n\n"
        f"View your request: {link}\n\n"
        "Best regards,\nGlomax Solar Enterprises"
    )
    html = _email_html('Your request is approved', paragraphs, rows, 'View My Request', link, note)

    return _send_customer_email(
        ticket, f'Your request is approved: {ticket.ticket_number}', plain, html, files
    )


def send_not_compatible_email(ticket, can_reapply):
    """
    Customer's request was marked Not Compatible by Staff.
    can_reapply=True  -> tells them they can send a new request.
    can_reapply=False -> tells them the request can't go ahead.
    """
    name = _customer_name(ticket)
    link = _portal_link('/request-status')

    rows = [('Ticket #', ticket.ticket_number), ('Property Address', ticket.property_address)]

    if can_reapply:
        subject = f'Update on your request: {ticket.ticket_number}'
        heading = 'Your request is not compatible for now'
        paragraphs = [
            f'Hi {name},',
            'We reviewed the roof assessment for your property. Right now it is not compatible, '
            'so we cannot go ahead with this request.',
            'You are welcome to reapply. You can send your request again from the Customer Portal, '
            'under Request Status.',
        ]
        button = 'Reapply in the Portal'
    else:
        subject = f'Update on your request: {ticket.ticket_number}'
        heading = 'Your request is not compatible'
        paragraphs = [
            f'Hi {name},',
            'We reviewed the roof assessment for your property. We are sorry, but it is not '
            'compatible, so we cannot go ahead with this request.',
            'If you have questions, please contact Glomax Solar Enterprises. Thank you for your interest.',
        ]
        button = 'View My Request'

    plain = (
        '\n\n'.join(paragraphs) + '\n\n'
        + ''.join(f"{label}: {value}\n" for label, value in rows)
        + f"\nView your request: {link}\n\n"
        "Best regards,\nGlomax Solar Enterprises"
    )
    html = _email_html(heading, paragraphs, rows, button, link)

    return _send_customer_email(ticket, subject, plain, html)


def send_completion_email(ticket):
    """
    Customer's request was marked Completed. Sends the Completion
    Certificate PDF. If the PDF can't be made, the email still goes out
    and tells the customer to download it from the portal.
    """
    from finalsheet.models import FinalSheet
    from finalsheet.pdf_builders import build_completion_certificate_pdf

    try:
        pdf = build_completion_certificate_pdf(ticket)
    except Exception:
        logger.exception("Could not make the Completion Certificate PDF for %s", ticket.ticket_number)
        pdf = None

    final_sheet = FinalSheet.objects.filter(ticket=ticket).first()
    name = _customer_name(ticket)
    link = _portal_link('/request-status')

    rows = [('Ticket #', ticket.ticket_number), ('Property Address', ticket.property_address)]
    if final_sheet and final_sheet.final_cost is not None:
        rows.append(('Final Cost', f'PHP {final_sheet.final_cost:,.2f}'))
    if ticket.completed_at:
        rows.append(('Completed On', ticket.completed_at.strftime('%B %d, %Y')))

    if pdf:
        note = 'Your Completion Certificate is attached to this email as a PDF.'
        files = [(f'{ticket.ticket_number}-completion-certificate.pdf', pdf)]
    else:
        note = 'You can download your Completion Certificate anytime from Request Status in the Customer Portal.'
        files = []

    paragraphs = [
        f'Hi {name},',
        'Your request is now completed. Thank you for choosing Glomax Solar Enterprises!',
        "We would also love to hear about your experience. Please leave your feedback in the Customer Portal.",
    ]

    plain = (
        f"Hi {name},\n\n"
        "Your request is now completed. Thank you for choosing Glomax Solar Enterprises!\n\n"
        + ''.join(f"{label}: {value}\n" for label, value in rows)
        + f"\n{note}\n\n"
        "We would also love to hear about your experience. Please leave your feedback in the Customer Portal.\n"
        f"{link}\n\n"
        "Best regards,\nGlomax Solar Enterprises"
    )
    html = _email_html('Your request is completed', paragraphs, rows, 'View My Request', link, note)

    return _send_customer_email(
        ticket, f'Your request is completed: {ticket.ticket_number}', plain, html, files
    )