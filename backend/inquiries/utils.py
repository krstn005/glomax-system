from django.core.mail import send_mail
from django.conf import settings

COMPANY_ADDRESS = "8000 Plaza Residences Plaza, Brgy. 303, Lacson St., Sta. Cruz, Manila"


def send_quotation_email(inquiry, package_details, estimated_cost, payment_terms, notes):
    """
    Sends the Initial Quotation to whoever submitted the inquiry.
    This can only be sent once per inquiry (enforced in the view).
    The email is one-way (no inbound reply handling), so the footer
    directs the customer back to the website's inquiry form for any
    follow-up, and asks them to reference this inquiry manually since
    there's no automatic way to link a new inquiry to this one.
    """
    subject = "Your Glomax Solar Quotation"

    message = (
        f"Hi {inquiry.full_name},\n\n"
        f"Thank you for your inquiry with Glomax Solar Enterprises. "
        f"Here is your initial quotation:\n\n"
        f"Package Details: {package_details}\n"
        f"Estimated Cost: {estimated_cost}\n"
        f"Payment Terms: {payment_terms}\n"
    )

    if notes:
        message += f"\nMessage from our team:\n{notes}\n"

    message += (
        "\nIf you'd like to proceed, please register an account on our "
        "website and submit a schedule request for a roof assessment.\n\n"
        "Best regards,\n"
        "Glomax Solar Enterprises\n\n"
        "----\n"
        "This is a one-time notification email. For further questions, "
        f"please visit our website and submit a new inquiry (reference "
        f"Inquiry #{inquiry.id} in your message so our team can assist "
        "you faster).\n\n"
        f"{COMPANY_ADDRESS}"
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[inquiry.email],
        fail_silently=False,
    )