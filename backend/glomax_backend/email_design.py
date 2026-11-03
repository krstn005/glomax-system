"""
One shared design for every email the system sends.

Every email (quotations, inquiry replies, sign-in codes, password links,
price updates, request updates, installer assignments) is built here, so
they all look the same: navy header with the logo, a short title, the
message, a small details table, a gold button, and the same footer.

How to use it in plain words:

    from glomax_backend.email_design import build_email, p, details, button

    blocks = [
        p('Hi Juan,'),
        p('Your request was received.'),
        details([('Ticket #', 'GLX-0001'), ('Address', '123 Rizal St')]),
        button('View My Request', 'https://glomaxsolar.me/request-status'),
    ]
    build_email('Subject here', 'juan@email.com', 'Title in the email', blocks).send()

Anything a person typed (names, notes, addresses) is escaped here, so
you can pass it in as normal text. The plain-text version of the email
(for mail apps that do not show HTML) is made from the same blocks.
"""
import os
from email.mime.image import MIMEImage

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape

COMPANY_ADDRESS = "8000 Plaza Residences Plaza, Brgy. 303, Lacson St., Sta. Cruz, Manila"

NAVY = '#0d1f3c'
GOLD = '#facc15'
LOGO_CID = 'glomax_logo'


# ---------------------------------------------------------------------
# Blocks - the pieces an email is made of
# ---------------------------------------------------------------------

def p(text):
    """A normal paragraph."""
    return ('p', text)


def details(rows):
    """A small table of (label, value) rows."""
    return ('rows', [(str(label), str(value)) for label, value in rows])


def code_box(code):
    """The big 6-digit code box."""
    return ('code', str(code))


def quote(text, label=None):
    """A message shown on a light box with a navy bar (like a staff reply)."""
    return ('quote', text, label)


def button(label, link, style='gold'):
    """A centered button. style is 'gold' (main) or 'navy' (second choice)."""
    return ('button', label, link, style)


def note(text):
    """A small yellow note box."""
    return ('note', text)


def small(text):
    """Small gray text."""
    return ('small', text)


def centered(text):
    """A short bold line, centered (for example "Have a question?")."""
    return ('centered', text)


def link_line(prefix, label, link):
    """A small centered line with one link, like: Already have an account? Sign in"""
    return ('link_line', prefix, label, link)


def bullets(title, items, muted=False):
    """A title with a short bullet list. muted=True makes it gray (old values)."""
    return ('bullets', title, list(items), muted)


# ---------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------

def button_html(label, link, style='gold'):
    bg, color = (GOLD, NAVY) if style == 'gold' else (NAVY, '#ffffff')
    return (
        '<div style="text-align:center;margin:6px 0 18px;">'
        f'<a href="{escape(link)}" target="_blank" '
        f'style="display:inline-block;background-color:{bg};color:{color};text-decoration:none;'
        f'font-weight:bold;font-size:15px;padding:14px 28px;border-radius:10px;">{escape(label)}</a>'
        '</div>'
    )


def _block_html(block):
    kind = block[0]

    if kind == 'p':
        return (
            '<p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:1.6;'
            f'white-space:pre-wrap;">{escape(block[1])}</p>'
        )

    if kind == 'rows':
        rows = ''.join(
            '<tr>'
            '<td style="padding:9px 14px 9px 0;border-bottom:1px solid #f1f3f6;color:#6b7280;'
            f'font-size:13px;width:40%;vertical-align:top;">{escape(label)}</td>'
            f'<td style="padding:9px 0;border-bottom:1px solid #f1f3f6;color:{NAVY};font-size:13px;'
            f'font-weight:bold;vertical-align:top;line-height:1.45;white-space:pre-wrap;">{escape(value)}</td>'
            '</tr>'
            for label, value in block[1]
        )
        return (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="margin:0 0 18px;border-top:1px solid #f1f3f6;">{rows}</table>'
        )

    if kind == 'code':
        return (
            '<div style="text-align:center;margin:6px 0 24px;">'
            '<span style="display:inline-block;background-color:#fef9c3;border:1.5px solid #eab308;'
            'border-radius:10px;padding:16px 32px;font-size:32px;font-weight:bold;letter-spacing:8px;'
            f'color:{NAVY};">{escape(block[1])}</span></div>'
        )

    if kind == 'quote':
        label = (
            f'<p style="margin:0 0 6px;font-size:11px;color:#6b7280;">{escape(block[2])}</p>'
            if block[2] else ''
        )
        return (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="margin:0 0 18px;background-color:#f9fafb;border-left:3px solid {NAVY};">'
            f'<tr><td style="padding:14px 18px;">{label}'
            '<p style="margin:0;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">'
            f'{escape(block[1])}</p></td></tr></table>'
        )

    if kind == 'button':
        return button_html(block[1], block[2], block[3])

    if kind == 'note':
        return (
            '<p style="margin:0 0 18px;padding:10px 12px;border-radius:8px;background:#fffbeb;'
            'border:1px solid #fde68a;color:#854d0e;font-size:13px;line-height:1.5;">'
            f'{escape(block[1])}</p>'
        )

    if kind == 'small':
        return (
            '<p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;'
            f'word-break:break-word;">{escape(block[1])}</p>'
        )

    if kind == 'centered':
        return (
            f'<p style="margin:18px 0 8px;text-align:center;color:{NAVY};font-size:14px;'
            f'font-weight:bold;">{escape(block[1])}</p>'
        )

    if kind == 'link_line':
        return (
            '<p style="margin:0 0 18px;text-align:center;color:#6b7280;font-size:12px;">'
            f'{escape(block[1])} '
            f'<a href="{escape(block[3])}" target="_blank" style="color:{NAVY};font-weight:bold;">'
            f'{escape(block[2])}</a></p>'
        )

    if kind == 'bullets':
        color, size, weight = ('#9ca3af', '13px', 'normal') if block[3] else (NAVY, '14px', 'bold')
        items = ''.join(f'<li style="margin:0 0 4px;">{escape(item)}</li>' for item in block[2])
        return (
            f'<p style="margin:0 0 6px;font-size:11px;color:#6b7280;">{escape(block[1])}</p>'
            f'<ul style="margin:0 0 18px;padding-left:18px;font-size:{size};font-weight:{weight};'
            f'color:{color};line-height:1.5;">{items}</ul>'
        )

    return ''


def wrap_html(inner_html, heading=None):
    """The shared look: header with logo, body, footer."""
    heading_html = (
        f'<h2 style="margin:0 0 14px;color:{NAVY};font-size:20px;line-height:1.3;">{escape(heading)}</h2>'
        if heading else ''
    )
    return f"""\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
  <div style="background-color:#f3f4f6;padding:32px 16px;font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr>
        <td style="background-color:{NAVY};padding:20px 32px;border-bottom:3px solid {GOLD};">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align:middle;padding-right:10px;">
                <img src="cid:{LOGO_CID}" width="32" height="32" alt="Glomax Solar" style="display:block;border-radius:6px;" />
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
          {heading_html}
          {inner_html}
        </td>
      </tr>
      <tr>
        <td style="background-color:#f9fafb;padding:16px 32px;border-top:1px solid #f1f3f6;">
          <p style="margin:0 0 4px;color:#9ca3af;font-size:11.5px;line-height:1.5;">
            This is an automated message from Glomax Solar Enterprises. Please do not reply to this email.
          </p>
          <p style="margin:0;color:#9ca3af;font-size:11.5px;line-height:1.5;">{escape(COMPANY_ADDRESS)}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
"""


def render_html(heading, blocks):
    return wrap_html(''.join(_block_html(block) for block in blocks), heading)


# ---------------------------------------------------------------------
# Plain text (for mail apps that do not show HTML)
# ---------------------------------------------------------------------

def _block_text(block):
    kind = block[0]
    if kind in ('p', 'note', 'small', 'centered'):
        return block[1]
    if kind == 'rows':
        return '\n'.join(f'{label}: {value}' for label, value in block[1])
    if kind == 'code':
        return f'Your code: {block[1]}'
    if kind == 'quote':
        return (f'{block[2]}:\n' if block[2] else '') + block[1]
    if kind == 'button':
        return f'{block[1]}: {block[2]}'
    if kind == 'link_line':
        return f'{block[1]} {block[2]}: {block[3]}'
    if kind == 'bullets':
        return f'{block[1]}:\n' + '\n'.join(f'  - {item}' for item in block[2])
    return ''


def render_text(heading, blocks):
    parts = [heading] if heading else []
    parts += [text for text in (_block_text(block) for block in blocks) if text]
    parts.append('Best regards,\nGlomax Solar Enterprises')
    parts.append(f'This is an automated message. Please do not reply to this email.\n{COMPANY_ADDRESS}')
    return '\n\n'.join(parts)


# ---------------------------------------------------------------------
# Building the email
# ---------------------------------------------------------------------

def attach_logo(email):
    """
    Puts the company logo inside the email so it shows as a picture. If
    the logo file is missing, the email still goes out without it.
    """
    logo_path = os.path.join(settings.BASE_DIR, 'finalsheet', 'static', 'finalsheet', 'logo.jpg')
    try:
        with open(logo_path, 'rb') as f:
            logo = MIMEImage(f.read())
        logo.add_header('Content-ID', f'<{LOGO_CID}>')
        logo.add_header('Content-Disposition', 'inline', filename='logo.jpg')
        email.attach(logo)
    except FileNotFoundError:
        pass


def build_email(subject, to, heading, blocks, pdf_files=()):
    """
    Makes the email message (it is not sent yet - call .send() on it).

    to        one email address, or a list of them
    heading   the title shown at the top of the email body
    blocks    the pieces, made with p(), details(), button() and so on
    pdf_files list of (file name, PDF bytes) to attach
    """
    recipients = [to] if isinstance(to, str) else list(to)
    email = EmailMultiAlternatives(
        subject=subject,
        body=render_text(heading, blocks),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=recipients,
    )
    email.attach_alternative(render_html(heading, blocks), 'text/html')
    attach_logo(email)
    for filename, content in pdf_files:
        email.attach(filename, content, 'application/pdf')
    return email
