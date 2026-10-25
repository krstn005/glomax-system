import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

from accounts.models import User
from notifications.models import Notification
from inquiries.utils import _attach_logo, _email_wrapper_html, _reply_button_html, COMPANY_ADDRESS

logger = logging.getLogger(__name__)


def _peso(amount):
    return f"\u20b1{amount:,.2f}"


def _send_price_emails(recipients, package_name, old_price, new_price, system_type_display, capacity_kw):
    """
    Sends the price announcement email to each customer, one by one.
    Runs in a background thread so Admin's "Add New Price" request is
    not slowed down. A failed email is logged and skipped - it never
    stops the rest.
    """
    portal_link = f"{settings.CUSTOMER_PORTAL_URL}/dashboard"
    subject = f"New price for the {package_name} package"

    for email_address, full_name in recipients:
        greeting_name = full_name or "there"

        text_message = (
            f"Hi {greeting_name},\n\n"
            f"The price of our {package_name} package has been updated.\n\n"
            f"Package: {package_name} ({system_type_display}, {capacity_kw} kW)\n"
            f"Old price: {_peso(old_price)}\n"
            f"New price: {_peso(new_price)}\n\n"
            "Final price is still confirmed after the roof assessment.\n\n"
            f"Open your account: {portal_link}\n\n"
            "Best regards,\n"
            "Glomax Solar Enterprises\n\n"
            f"{COMPANY_ADDRESS}"
        )

        inner_html = f"""\
    <p style="margin:0 0 14px; font-size:14px; color:#111827;">Hi {greeting_name},</p>
    <p style="margin:0 0 18px; font-size:14px; color:#374151; line-height:1.5;">
      The price of one of our solar packages has been updated.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;">
      <tr>
        <td style="padding:16px 18px 8px;">
          <p style="margin:0 0 3px; font-size:11px; color:#6b7280;">Package</p>
          <p style="margin:0; font-size:14px; font-weight:bold; color:#111827;">{package_name}</p>
          <p style="margin:2px 0 0; font-size:12px; color:#6b7280;">{system_type_display} &middot; {capacity_kw} kW</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 18px;">
          <p style="margin:0 0 3px; font-size:11px; color:#6b7280;">Old Price</p>
          <p style="margin:0; font-size:14px; color:#6b7280; text-decoration:line-through;">{_peso(old_price)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 18px 16px;">
          <p style="margin:0 0 3px; font-size:11px; color:#6b7280;">New Price</p>
          <p style="margin:0; font-size:18px; font-weight:bold; color:#0d1f3c;">{_peso(new_price)}</p>
        </td>
      </tr>
    </table>

    <p style="margin:18px 0 0; font-size:13px; color:#374151; line-height:1.5;">
      The final price is still confirmed after the roof assessment.
    </p>
{_reply_button_html(portal_link, label="Open My Account")}
"""

        try:
            email = EmailMultiAlternatives(
                subject=subject,
                body=text_message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[email_address],
            )
            email.attach_alternative(_email_wrapper_html(inner_html), "text/html")
            email.mixed_subtype = "related"
            _attach_logo(email)
            email.send(fail_silently=False)
        except Exception as e:
            logger.error(f"Could not send price update email to {email_address}: {e}")


def announce_price_change(old_price, new_entry):
    """
    Tells every active customer account that a package price changed.

    - Bell notification: every active Customer account.
    - Email: only customers who have Email Updates turned on in their
      Settings and have an email address.

    Never raises. If anything goes wrong it is logged and skipped, so
    Admin's price is always saved.
    """
    try:
        customers = list(
            User.objects.filter(
                role=User.Role.CUSTOMER,
                is_active=True,
                is_active_account=True,
            )
        )
        if not customers:
            return

        message = (
            f"Price update: {new_entry.package_name} is now {_peso(new_entry.price)} "
            f"(was {_peso(old_price)})."
        )[:255]

        Notification.objects.bulk_create([
            Notification(
                recipient=customer,
                kind=Notification.Kind.PRICE_UPDATE,
                message=message,
                link="/dashboard",
            )
            for customer in customers
        ])

        recipients = [
            (c.email, c.full_name or c.username)
            for c in customers
            if c.email and c.notify_email_updates
        ]
        if recipients:
            threading.Thread(
                target=_send_price_emails,
                args=(
                    recipients,
                    new_entry.package_name,
                    old_price,
                    new_entry.price,
                    new_entry.get_system_type_display(),
                    new_entry.rated_capacity_kw,
                ),
                daemon=True,
            ).start()
    except Exception as e:
        logger.error(f"Could not announce price change for {new_entry.package_name}: {e}")