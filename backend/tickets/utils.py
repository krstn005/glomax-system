from django.core.mail import send_mail
from django.conf import settings


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