from email.mime.image import MIMEImage

from django.core.mail import EmailMultiAlternatives
from django.conf import settings

COMPANY_ADDRESS = "8000 Plaza Residences Plaza, Brgy. 303, Lacson St., Sta. Cruz, Manila"

# Reuses the same logo asset already used in the Final Sheet PDF -
# keeps the same visual identity across every document/email the
# system sends.
LOGO_PATH = settings.BASE_DIR / "finalsheet" / "static" / "finalsheet" / "logo.jpg"


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


def _attach_logo(email):
    """
    Embeds the company logo inline in the HTML email using a
    Content-ID, so it displays as an actual image in Gmail (not a
    separate downloadable attachment). Silently skips embedding if the
    logo file isn't found, so a missing asset never breaks email
    sending - the email still goes out, just without the logo.
    """
    try:
        with open(LOGO_PATH, "rb") as f:
            logo = MIMEImage(f.read())
            logo.add_header("Content-ID", "<company_logo>")
            logo.add_header("Content-Disposition", "inline", filename="logo.jpg")
            email.attach(logo)
    except FileNotFoundError:
        pass


def _email_wrapper_html(inner_html):
    """
    Shared HTML shell used by every email this app sends. No border
    around the main container - the white card just sits on the
    light gray page background, reading as an ordinary company email
    rather than a boxed/templated look.
    """
    return f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#ffffff;">

          <tr>
            <td style="background-color:#0d1f3c; padding:18px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:10px; vertical-align:middle;">
                    <img src="cid:company_logo" width="32" height="32" style="display:block;" alt="Glomax Solar" />
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="color:#ffffff; font-size:14px; font-weight:bold;">Glomax Solar Enterprises</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px;">
              {inner_html}
            </td>
          </tr>

          <tr>
            <td style="padding:14px 24px; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:11px; color:#9ca3af; line-height:1.5;">
                Glomax Solar Enterprises &middot; {COMPANY_ADDRESS}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def _reply_button_html(reply_link, label="Reply to this Inquiry"):
    """
    Plain rectangular button, centered using align="center" on its
    own full-width table row - the most reliable way to center a
    button across different email clients (Gmail, Outlook, etc.)
    without relying on flexbox/CSS that many clients strip out.
    """
    return f"""\
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 10px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#0d1f3c;">
                <a href="{reply_link}" target="_blank"
                   style="display:inline-block; padding:10px 20px; font-size:13px; font-weight:bold; color:#ffffff; text-decoration:none;">
                  {label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0; font-size:12px; color:#9ca3af; text-align:center;">
      Please do not reply directly to this email.
    </p>
"""


def send_quotation_email(inquiry, package_details, estimated_cost, payment_terms, notes):
    """
    Sends the Initial Quotation to whoever submitted the inquiry.
    This can only be sent once per inquiry (enforced in the view).
    The email now includes the Reply Link, so the customer can
    continue the conversation inside the system (via the public
    reply-link page) instead of replying directly to this email or
    submitting a brand new, disconnected inquiry.
    """
    subject = "Your Glomax Solar Quotation"
    reply_link = _get_reply_link(inquiry)

    # Plain-text version - unchanged in content, still sent as the
    # fallback for email clients that don't render HTML.
    text_message = (
        f"Hi {inquiry.full_name},\n\n"
        f"Thank you for your inquiry with Glomax Solar Enterprises. "
        f"Here is your initial quotation:\n\n"
        f"Package Details: {package_details}\n"
        f"Estimated Cost: {estimated_cost}\n"
        f"Payment Terms: {payment_terms}\n"
    )
    if notes:
        text_message += f"\nMessage from our team:\n{notes}\n"
    text_message += (
        "\nIf you'd like to proceed, please register an account on our "
        "website and submit a schedule request for a roof assessment.\n\n"
        "Best regards,\n"
        "Glomax Solar Enterprises\n\n"
        "----\n"
        "To continue this conversation, please click the link below:\n"
        f"{reply_link}\n\n"
        "Please do not reply directly to this email.\n\n"
        f"{COMPANY_ADDRESS}"
    )

    notes_html = ""
    if notes:
        notes_html = f"""\
    <p style="margin:14px 0 0; font-size:13px; color:#374151; line-height:1.5;">
      <strong>Message from our team:</strong><br />{notes}
    </p>
"""

    # Quotation details shown as plain label/value rows on a light
    # gray background, separated only by spacing - no border outline
    # around the box, keeps it reading as ordinary email content
    # rather than a "designed" card.
    inner_html = f"""\
    <p style="margin:0 0 14px; font-size:14px; color:#111827;">Hi {inquiry.full_name},</p>
    <p style="margin:0 0 18px; font-size:14px; color:#374151; line-height:1.5;">
      Thank you for your inquiry with Glomax Solar Enterprises. Here is your
      initial quotation:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;">
      <tr>
        <td style="padding:16px 18px 8px;">
          <p style="margin:0 0 3px; font-size:11px; color:#6b7280;">Package Details</p>
          <p style="margin:0; font-size:14px; font-weight:bold; color:#111827;">{package_details}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 18px;">
          <p style="margin:0 0 3px; font-size:11px; color:#6b7280;">Estimated Cost</p>
          <p style="margin:0; font-size:15px; font-weight:bold; color:#0d1f3c;">{estimated_cost}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 18px 16px;">
          <p style="margin:0 0 3px; font-size:11px; color:#6b7280;">Payment Terms</p>
          <p style="margin:0; font-size:14px; font-weight:bold; color:#111827;">{payment_terms}</p>
        </td>
      </tr>
    </table>
{notes_html}
    <p style="margin:18px 0; font-size:14px; color:#374151; line-height:1.5;">
      If you'd like to proceed, please register an account on our website and
      submit a schedule request for a roof assessment.
    </p>

    <p style="margin:0 0 4px; font-size:14px; color:#111827; font-weight:bold; text-align:center;">Have a follow-up question?</p>
{_reply_button_html(reply_link)}
"""

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[inquiry.email],
    )
    email.attach_alternative(_email_wrapper_html(inner_html), "text/html")
    email.mixed_subtype = "related"
    _attach_logo(email)
    email.send(fail_silently=False)


def send_reply_email(inquiry, staff_message_content):
    """
    Sends Staff's follow-up reply to the customer's email. Includes
    the same Reply Link again so the customer can keep the
    conversation going as many times as needed.
    """
    subject = "New Reply to Your Glomax Solar Inquiry"
    reply_link = _get_reply_link(inquiry)

    text_message = (
        f"Hi {inquiry.full_name},\n\n"
        f"You have a new reply from Glomax Solar Enterprises regarding "
        f"your inquiry:\n\n"
        f"\"{staff_message_content}\"\n\n"
        "----\n"
        "To view the full conversation or continue asking questions, "
        "please click the link below:\n"
        f"{reply_link}\n\n"
        "Please do not reply directly to this email.\n\n"
        "Best regards,\n"
        "Glomax Solar Enterprises\n\n"
        f"{COMPANY_ADDRESS}"
    )

    # Staff's message shown on a light gray background with just a
    # left color bar for emphasis - no full outline around it.
    inner_html = f"""\
    <p style="margin:0 0 14px; font-size:14px; color:#111827;">Hi {inquiry.full_name},</p>
    <p style="margin:0 0 14px; font-size:14px; color:#374151; line-height:1.5;">
      You have a new reply from Glomax Solar Enterprises regarding your inquiry:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb; border-left:3px solid #0d1f3c;">
      <tr>
        <td style="padding:14px 18px;">
          <p style="margin:0; font-size:14px; color:#111827; line-height:1.5; white-space:pre-wrap;">{staff_message_content}</p>
        </td>
      </tr>
    </table>

    <p style="margin:18px 0 4px; font-size:14px; color:#111827; font-weight:bold; text-align:center;">Want to continue the conversation?</p>
{_reply_button_html(reply_link, label="View Conversation & Reply")}
"""

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[inquiry.email],
    )
    email.attach_alternative(_email_wrapper_html(inner_html), "text/html")
    email.mixed_subtype = "related"
    _attach_logo(email)
    email.send(fail_silently=False)