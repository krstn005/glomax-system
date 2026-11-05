import logging
from urllib.parse import urljoin

from django.conf import settings

from glomax_backend.email_design import build_email, button, details, note, p, quote

logger = logging.getLogger(__name__)


def _portal_link(path):
    base = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5173')
    return urljoin(base.rstrip('/') + '/', path.lstrip('/'))


def _customer_name(ticket):
    customer = ticket.customer
    return (
        (getattr(ticket, 'full_name', '') or '').strip()
        or (getattr(customer, 'full_name', '') or '').strip()
        or (customer.get_full_name() or '').strip()
        or customer.username
    )


def send_assignment_email(ticket):
    """
    Notifies the assigned Partner Installer by email once Staff assigns
    them to a ticket. Uses the shared Glomax email design (same as every
    other email). Failures here are logged but never block the
    assignment itself from succeeding - a missed notification email
    shouldn't undo a real ticket update.
    """
    installer = ticket.partner_installer
    if not installer or not installer.email:
        return

    name = (getattr(installer, 'full_name', '') or '').strip() or installer.username
    visit_date = ticket.visit_date.strftime('%B %d, %Y') if ticket.visit_date else 'To be confirmed'

    blocks = [
        p(f'Hi {name},'),
        p('You have been assigned a new roof assessment visit. Here are the details:'),
        details([
            ('Ticket #', ticket.ticket_number),
            ('Customer', _customer_name(ticket)),
            ('Property Address', ticket.property_address),
            ('Contact Number', ticket.contact_number),
            ('Visit Date', visit_date),
        ]),
        p('Please open the Partner Installer Portal to see the full details.'),
        button('Open This Visit', _portal_link(f'/partner-installer/incoming-tickets/{ticket.id}')),
    ]

    try:
        build_email(
            f'New Assignment: {ticket.ticket_number}',
            installer.email,
            'New roof assessment visit',
            blocks,
        ).send(fail_silently=True)
    except Exception:
        # Assignment already succeeded in the database by the time
        # this runs - a broken email send should not surface as an
        # error to Staff or roll back the assignment.
        logger.exception("Could not send the assignment email for %s", ticket.ticket_number)


# ---------------------------------------------------------------------
# Emails to the Customer (with PDF)
# ---------------------------------------------------------------------
# These emails go out when the final result of a request is known:
#   - Approved             -> Disclosure Agreement PDF attached
#   - Not Compatible       -> short explanation, no PDF
#   - Completed            -> Completion Certificate PDF attached
#   - Reschedule decision  -> new visit date approved or declined
# Each one returns True if the email was sent, and False if not (no
# email address, or sending failed). A failed email is written to the
# server log, but it never undoes the ticket update that already
# happened. All of them use the shared Glomax email design.


def _send_customer_email(ticket, subject, heading, blocks, pdf_files=()):
    """
    Sends one email to the Customer. pdf_files is a list of
    (file name, PDF bytes). Returns True if sent, False if not.
    """
    customer = ticket.customer
    if not customer or not customer.email:
        logger.info("No email on file for the customer of %s - email skipped.", ticket.ticket_number)
        return False

    try:
        build_email(subject, customer.email, heading, blocks, pdf_files).send()
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
        note_text = 'Your Disclosure Agreement is attached to this email as a PDF. Please read it carefully.'
        files = [(f'{ticket.ticket_number}-disclosure-agreement.pdf', pdf)]
    else:
        note_text = 'You can download your Disclosure Agreement anytime from Request Status in the Customer Portal.'
        files = []

    blocks = [
        p(f'Hi {name},'),
        p('Good news! Your roof assessment was reviewed and your request has been approved.'),
        details(rows),
        note(note_text),
        button('View My Request', link),
    ]
    return _send_customer_email(
        ticket, f'Your request is approved: {ticket.ticket_number}', 'Your request is approved', blocks, files
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
    subject = f'Update on your request: {ticket.ticket_number}'

    if can_reapply:
        heading = 'Your request is not compatible for now'
        paragraphs = [
            f'Hi {name},',
            'We reviewed the roof assessment for your property. Right now it is not compatible, '
            'so we cannot go ahead with this request.',
            'You are welcome to reapply. You can send your request again from the Customer Portal, '
            'under Request Status.',
        ]
        if ticket.reapply_until:
            rows.append(('Reapply Until', ticket.reapply_until.strftime('%B %d, %Y')))
            paragraphs.append(
                'After the "Reapply Until" date below, the Reapply button will be gone. If you still want to apply later, '
                'please contact Glomax Solar Enterprises.'
            )
        button_text = 'Reapply in the Portal'
    else:
        heading = 'Your request is not compatible'
        paragraphs = [
            f'Hi {name},',
            'We reviewed the roof assessment for your property. We are sorry, but it is not '
            'compatible, so we cannot go ahead with this request.',
            'If you have questions, please contact Glomax Solar Enterprises. Thank you for your interest.',
        ]
        button_text = 'View My Request'

    reason = (getattr(ticket, 'not_compatible_reason', '') or '').strip()
    blocks = [p(text) for text in paragraphs]
    if reason:
        blocks.append(quote(reason, 'Reason from our team'))
    blocks += [details(rows), button(button_text, link)]
    return _send_customer_email(ticket, subject, heading, blocks)


def send_reapply_enabled_email(ticket):
    """Staff turned reapply on again. Tells the Customer the new last day."""
    name = _customer_name(ticket)
    link = _portal_link('/request-status')
    until = ticket.reapply_until.strftime('%B %d, %Y') if ticket.reapply_until else ''

    blocks = [
        p(f'Hi {name},'),
        p('Good news! You can reapply for your request again.'),
        details([
            ('Ticket #', ticket.ticket_number),
            ('Property Address', ticket.property_address),
            ('Reapply Until', until),
        ]),
        button('Reapply in the Portal', link),
    ]
    return _send_customer_email(
        ticket, f'You can reapply again: {ticket.ticket_number}', 'You can reapply again', blocks
    )


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
        note_text = 'Your Completion Certificate is attached to this email as a PDF.'
        files = [(f'{ticket.ticket_number}-completion-certificate.pdf', pdf)]
    else:
        note_text = 'You can download your Completion Certificate anytime from Request Status in the Customer Portal.'
        files = []

    blocks = [
        p(f'Hi {name},'),
        p('Your request is now completed. Thank you for choosing Glomax Solar Enterprises!'),
        p('We would also love to hear about your experience. Please leave your feedback in the Customer Portal.'),
        details(rows),
        note(note_text),
        button('View My Request', link),
    ]
    return _send_customer_email(
        ticket, f'Your request is completed: {ticket.ticket_number}', 'Your request is completed', blocks, files
    )


def send_reschedule_decision_email(ticket, reschedule, approved):
    """
    Customer asked for a new visit date and Staff answered. Tells the
    Customer if the new date was approved or declined. Returns True if
    the email was sent, False if not.
    """
    name = _customer_name(ticket)
    link = _portal_link('/request-status')

    rows = [('Ticket #', ticket.ticket_number), ('Property Address', ticket.property_address)]
    if approved:
        subject = f'Your new visit date is approved: {ticket.ticket_number}'
        heading = 'Your new visit date is approved'
        paragraphs = [
            f'Hi {name},',
            'Good news! Staff approved your request to change the visit date.',
        ]
        rows.append(('New Visit Date', reschedule.requested_date.strftime('%B %d, %Y')))
    else:
        subject = f'Your reschedule request was declined: {ticket.ticket_number}'
        heading = 'Your reschedule request was declined'
        paragraphs = [
            f'Hi {name},',
            'Staff could not approve your request to change the visit date, so the visit date stays the same.',
        ]
        if ticket.visit_date:
            rows.append(('Visit Date', ticket.visit_date.strftime('%B %d, %Y')))
        rows.append(('Date You Asked For', reschedule.requested_date.strftime('%B %d, %Y')))

    staff_note = (reschedule.staff_response_note or '').strip()
    if staff_note:
        rows.append(('Note from Staff', staff_note))

    blocks = [p(text) for text in paragraphs] + [details(rows), button('View My Request', link)]
    return _send_customer_email(ticket, subject, heading, blocks)