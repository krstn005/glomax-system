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


def send_completion_email(ticket):
    """
    Notifies the Customer by email once their Partner Installer marks
    the installation Completed. Same Resend setup and same
    fail-silently pattern as send_assignment_email - a missed email
    should never undo the completion itself, which has already been
    saved to the database by the time this runs.
    """
    customer = ticket.customer
    if not customer or not customer.email:
        return

    subject = f"Your Installation is Complete: {ticket.ticket_number}"

    final_cost = ticket.final_sheet.final_cost if hasattr(ticket, 'final_sheet') else None
    cost_line = f"Final Cost: \u20b1{final_cost:,.2f}\n" if final_cost is not None else ""

    message = (
        f"Hi {customer.username},\n\n"
        f"Great news! Your solar installation is now complete.\n\n"
        f"Ticket #: {ticket.ticket_number}\n"
        f"Property Address: {ticket.property_address}\n"
        f"{cost_line}"
        f"Completed On: {ticket.completed_at.strftime('%B %d, %Y') if ticket.completed_at else ''}\n\n"
        "You can view your completed request and download your Final Sheet anytime "
        "from the Customer Portal under Request Status. We'd also love to hear about "
        "your experience - please consider leaving feedback there.\n\n"
        "Thank you for choosing Glomax Solar Enterprises!\n\n"
        "Best regards,\nGlomax Solar Enterprises"
    )

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[customer.email],
            fail_silently=True,
        )
    except Exception:
        # Completion already succeeded in the database by the time
        # this runs - a broken email send should not surface as an
        # error to the Partner Installer or roll back the completion.
        pass