import logging
import threading

from django.conf import settings

from accounts.models import User
from notifications.models import Notification
from glomax_backend.email_design import build_email, bullets, button, details, p
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
        try:
            blocks = [
                p(f"Hi {full_name or 'there'},"),
                p("The price of one of our solar packages has been updated."),
                details([
                    ("Package", package_name),
                    ("System", f"{system_type_display} · {capacity_kw} kW"),
                    ("Old price", _peso(old_price)),
                    ("New price", _peso(new_price)),
                ]),
                p("The final price is still confirmed after the roof assessment."),
                button("Open My Account", portal_link),
            ]
            build_email(subject, email_address, "Package price update", blocks).send(fail_silently=False)
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

    for email_address, full_name in recipients:
        try:
            blocks = [
                p(f"Hi {full_name or 'there'},"),
                p("The payment terms for our solar packages have been updated."),
                bullets("New payment terms", new_parts),
            ]
            if old_parts:
                blocks.append(bullets("Previous payment terms", old_parts, muted=True))
            blocks += [
                p("The final price and terms are still confirmed after the roof assessment."),
                button("Open My Account", portal_link),
            ]
            build_email(subject, email_address, "Payment terms update", blocks).send(fail_silently=False)
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


def _send_updated_quotation_email(email_address, name, ticket_number, package_details,
                                  cost_text, terms_parts, notes):
    """
    Sends the Updated Quotation email to one customer. Runs in a
    background thread. A failure is logged and never reaches Staff.
    """
    try:
        rows = [
            ("Ticket #", ticket_number),
            ("Package", package_details),
            ("Estimated cost", cost_text),
        ]
        blocks = [
            p(f"Hi {name or 'there'},"),
            p(
                "Thank you for your patience. Our team reviewed the roof "
                "assessment and prepared your updated quotation."
            ),
            details(rows),
        ]
        if terms_parts:
            blocks.append(bullets("Payment terms", terms_parts))
        if notes:
            blocks.append(p(notes))
        blocks += [
            p("You can also see this quotation in your account."),
            button("View My Request", f"{settings.CUSTOMER_PORTAL_URL}/request-status"),
        ]
        build_email(
            f"Your updated quotation for {ticket_number}",
            email_address,
            "Your updated quotation",
            blocks,
        ).send(fail_silently=False)
    except Exception as e:
        logger.error(f"Could not send updated quotation email to {email_address}: {e}")


def announce_updated_quotation(ticket, quotation):
    """
    Emails the Customer their Updated Quotation. Called right after
    Staff sends it. Never raises, so the quotation is always saved.
    Returns True if an email was started, False if there was no email
    address or something went wrong.
    """
    try:
        customer = ticket.customer
        if not customer.email:
            return False

        name = (ticket.full_name or customer.full_name or customer.username or '').strip()
        terms = quotation.payment_terms.description if quotation.payment_terms_id else ''

        _start_email_thread(
            _send_updated_quotation_email,
            (
                customer.email,
                name,
                ticket.ticket_number,
                quotation.package_details,
                _peso(quotation.estimated_cost),
                _split_terms(terms),
                (quotation.notes or '').strip(),
            ),
        )
        return True
    except Exception as e:
        logger.error(f"Could not start updated quotation email for {ticket.ticket_number}: {e}")
        return False