import logging
import threading

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

from accounts.models import User
from notifications.models import Notification
from inquiries.utils import _attach_logo, _email_wrapper_html, _reply_button_html, COMPANY_ADDRESS
from adminconfig.sms_notify import send_template_sms

logger = logging.getLogger(__name__)

# Where the bell notification opens, for each portal
PORTAL_LINKS = {
    'CUSTOMER': '/dashboard',
    'STAFF': '/staff/active-prices',
    'PARTNER_INSTALLER': '/partner-installer/active-prices',
    'ADMIN': '/admin/active-prices',
}


def _peso(amount):
    return f"₱{amount:,.2f}"


def _notify_all_portals(message):
    """
    Sends one bell notification to everyone who uses the system:
    every active Customer, Staff, Partner Installer and Admin (the
    Admin who made the change is included too). Each person's
    notification opens the right page in their own portal.

    Returns the list of customers, so the caller can email them.
    """
    message = message[:255]

    customers = list(
        User.objects.filter(
            role=User.Role.CUSTOMER,
            is_active=True,
            is_active_account=True,
        )
    )
    workers = list(
        User.objects.filter(
            role__in=['STAFF', 'PARTNER_INSTALLER', 'ADMIN'],
            is_active=True,
        )
    )

    Notification.objects.bulk_create([
        Notification(
            recipient=person,
            kind=Notification.Kind.PRICE_UPDATE,
            message=message,
            link=PORTAL_LINKS.get(person.role, '/dashboard'),
        )
        for person in customers + workers
    ])
    return customers


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


def _split_terms(description):
    """'50% down, 50% after' -> ['50% down', '50% after']"""
    return [part.strip() for part in (description or '').split(',') if part.strip()]


def _send_terms_emails(recipients, old_description, new_description):
    """
    Sends the payment terms announcement email to each customer, one by
    one, in a background thread. A failed email is logged and skipped.
    """
    portal_link = f"{settings.CUSTOMER_PORTAL_URL}/dashboard"
    subject = "Our payment terms were updated"
    new_parts = _split_terms(new_description)
    old_parts = _split_terms(old_description)

    new_lines_html = ''.join(
        f'<li style="margin:0 0 4px;">{escape(part)}</li>' for part in new_parts
    )
    old_lines_html = ''.join(
        f'<li style="margin:0 0 4px;">{escape(part)}</li>' for part in old_parts
    )

    for email_address, full_name in recipients:
        greeting_name = escape(full_name or "there")

        text_message = (
            f"Hi {full_name or 'there'},\n\n"
            "The payment terms for our solar packages have been updated.\n\n"
            "New payment terms:\n"
            + ''.join(f"  - {part}\n" for part in new_parts)
            + "\nPrevious payment terms:\n"
            + ''.join(f"  - {part}\n" for part in old_parts)
            + "\nThe final price and terms are still confirmed after the roof assessment.\n\n"
            f"Open your account: {portal_link}\n\n"
            "Best regards,\n"
            "Glomax Solar Enterprises\n\n"
            f"{COMPANY_ADDRESS}"
        )

        inner_html = f"""\
    <p style="margin:0 0 14px; font-size:14px; color:#111827;">Hi {greeting_name},</p>
    <p style="margin:0 0 18px; font-size:14px; color:#374151; line-height:1.5;">
      The payment terms for our solar packages have been updated.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;">
      <tr>
        <td style="padding:16px 18px 8px;">
          <p style="margin:0 0 6px; font-size:11px; color:#6b7280;">New Payment Terms</p>
          <ul style="margin:0; padding-left:18px; font-size:14px; font-weight:bold; color:#0d1f3c;">{new_lines_html}</ul>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 18px 16px;">
          <p style="margin:0 0 6px; font-size:11px; color:#6b7280;">Previous Payment Terms</p>
          <ul style="margin:0; padding-left:18px; font-size:13px; color:#6b7280; text-decoration:line-through;">{old_lines_html}</ul>
        </td>
      </tr>
    </table>

    <p style="margin:18px 0 0; font-size:13px; color:#374151; line-height:1.5;">
      The final price and terms are still confirmed after the roof assessment.
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
            logger.error(f"Could not send payment terms email to {email_address}: {e}")


def _text_customers(customers, code):
    """
    Sends an SMS template (like '17' price update) to every customer who
    has a phone number. Customers who turned off SMS Updates are skipped
    inside send_template_sms. Never raises.
    """
    try:
        link = f"{settings.CUSTOMER_PORTAL_URL}/dashboard"
        for customer in customers:
            if not customer.phone_number:
                continue
            first = ((customer.full_name or customer.username or '').strip().split(' ') or [''])[0]
            values = {'customer_name': first[:1].upper() + first[1:], 'link': link}
            send_template_sms(code, customer.phone_number, values, user=customer)
    except Exception as e:
        logger.error(f"Could not send SMS announcement {code}: {e}")


def _start_email_thread(target, args):
    threading.Thread(target=target, args=args, daemon=True).start()


def announce_price_change(old_price, new_entry):
    """
    Tells everyone that a package price changed.

    - Bell notification: every active Customer, Staff, Partner
      Installer and Admin (including the Admin who made the change).
      Each one opens their own Active Prices page / dashboard.
    - Email: only customers who have Email Updates turned on in their
      Settings and have an email address.

    Never raises. If anything goes wrong it is logged and skipped, so
    Admin's price is always saved.
    """
    try:
        message = (
            f"Price update: {new_entry.package_name} is now {_peso(new_entry.price)} "
            f"(was {_peso(old_price)})."
        )
        customers = _notify_all_portals(message)
        _start_email_thread(_text_customers, (customers, '17'))

        recipients = [
            (c.email, c.full_name or c.username)
            for c in customers
            if c.email and c.notify_email_updates
        ]
        if recipients:
            _start_email_thread(
                _send_price_emails,
                (
                    recipients,
                    new_entry.package_name,
                    old_price,
                    new_entry.price,
                    new_entry.get_system_type_display(),
                    new_entry.rated_capacity_kw,
                ),
            )
    except Exception as e:
        logger.error(f"Could not announce price change for {new_entry.package_name}: {e}")


def announce_payment_terms_change(old_description, new_entry):
    """
    Tells everyone that the payment terms changed. Same people as
    announce_price_change: bell notification for every active Customer,
    Staff, Partner Installer and Admin, and an email for customers who
    have Email Updates turned on.

    Never raises. If anything goes wrong it is logged and skipped, so
    Admin's new payment terms are always saved.
    """
    try:
        message = f"Payment terms updated: {new_entry.description}"
        if len(message) > 255:
            message = message[:252] + "..."
        customers = _notify_all_portals(message)
        _start_email_thread(_text_customers, (customers, '18'))

        recipients = [
            (c.email, c.full_name or c.username)
            for c in customers
            if c.email and c.notify_email_updates
        ]
        if recipients:
            _start_email_thread(
                _send_terms_emails,
                (recipients, old_description, new_entry.description),
            )
    except Exception as e:
        logger.error(f"Could not announce payment terms change: {e}")