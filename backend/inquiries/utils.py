from urllib.parse import urlencode

from django.conf import settings

from glomax_backend.email_design import (
    COMPANY_ADDRESS,
    attach_logo,
    build_email,
    button,
    button_html,
    centered,
    details,
    link_line,
    p,
    quote,
    wrap_html,
)


def _get_reply_link(inquiry):
    """
    Builds the public, no-login reply-link URL for this inquiry, using
    its access_token (never the database id). FRONTEND_BASE_URL should
    be set in settings.py to the real deployed frontend domain in
    production - falls back to localhost for local dev if it isn't
    set yet.
    """
    base_url = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173")
    return f"{base_url.rstrip('/')}/inquiry-reply/{inquiry.access_token}/"


def _get_site_links(inquiry):
    """
    Links to our website for the Initial Quotation email, so the
    customer can go straight to it without searching or opening the
    conversation page first.

    The Register link carries the customer's name and email, so the
    form is already filled in. Registering with the same email also
    lets the system connect their quotation to their new request.
    """
    base_url = getattr(settings, "FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    params = urlencode({
        "name": (inquiry.full_name or "")[:100],
        "email": (inquiry.email or "")[:150],
    })
    return {
        "register": f"{base_url}/register?{params}",
        "login": f"{base_url}/login",
    }


# --- The email design now lives in glomax_backend/email_design.py, so
# every email in the system looks the same. These small helpers are
# kept so other files that still import them keep working.

def _attach_logo(email):
    attach_logo(email)


def _email_wrapper_html(inner_html):
    return wrap_html(inner_html)


def _reply_button_html(reply_link, label="Reply to this Inquiry"):
    return button_html(label, reply_link, 'navy')


def _cta_button_html(link, label):
    return button_html(label, link, 'gold')


def send_quotation_email(inquiry, package_details, estimated_cost, payment_terms, notes):
    """
    Sends the Initial Quotation to whoever submitted the inquiry.
    This can only be sent once per inquiry (enforced in the view).
    The email includes the Reply Link, so the customer can continue
    the conversation inside the system (via the public reply-link
    page) instead of replying directly to this email or submitting a
    brand new, disconnected inquiry.

    Anything typed by a person (name, package, cost, terms, notes) is
    escaped by the shared email design, so typed HTML or symbols can
    never change how the email looks or works.
    """
    reply_link = _get_reply_link(inquiry)
    site_links = _get_site_links(inquiry)

    blocks = [
        p(f"Hi {inquiry.full_name},"),
        p("Thank you for your inquiry with Glomax Solar Enterprises. Here is your initial quotation:"),
        details([
            ("Package Details", package_details),
            ("Estimated Cost", estimated_cost),
            ("Payment Terms", payment_terms),
        ]),
    ]
    if notes:
        blocks.append(quote(notes, label="Message from our team"))
    blocks += [
        p(
            "If you'd like to proceed, please register an account on our website "
            "and submit a schedule request for a roof assessment."
        ),
        button("Create My Account", site_links["register"], 'gold'),
        link_line("Already have an account?", "Sign in", site_links["login"]),
        centered("Have a follow-up question?"),
        button("Reply to this Inquiry", reply_link, 'navy'),
    ]

    email = build_email(
        "Your Glomax Solar Quotation",
        inquiry.email,
        "Your quotation",
        blocks,
    )
    email.send(fail_silently=False)


def send_reply_email(inquiry, staff_message_content):
    """
    Sends Staff's follow-up reply to the customer's email. Includes
    the same Reply Link again so the customer can keep the
    conversation going as many times as needed.
    """
    reply_link = _get_reply_link(inquiry)

    blocks = [
        p(f"Hi {inquiry.full_name},"),
        p("You have a new reply from Glomax Solar Enterprises regarding your inquiry:"),
        quote(staff_message_content),
        centered("Want to continue the conversation?"),
        button("View Conversation & Reply", reply_link, 'gold'),
    ]

    email = build_email(
        "New Reply to Your Glomax Solar Inquiry",
        inquiry.email,
        "You have a new reply",
        blocks,
    )
    email.send(fail_silently=False)