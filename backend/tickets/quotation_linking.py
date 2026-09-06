from decimal import Decimal, InvalidOperation
import re


def parse_cost_text(raw_text):
    """
    Converts a free-text cost string (e.g. "P250,000", "250000.50")
    into a Decimal, or returns None if it can't be parsed.
    """
    if not raw_text:
        return None
    cleaned = re.sub(r'[^\d.]', '', raw_text)
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def link_initial_quotation_to_ticket(ticket, inquiry):
    """
    Copies an Inquiry's already-sent Initial Quotation onto a real
    pricing.Quotation record attached to the given ticket. Shared by
    both directions this can happen in:
      1. TicketListCreateView - a ticket is created AFTER a matching
         Inquiry already had its quotation sent (checks at ticket
         creation time).
      2. InquirySendQuotationView - Staff sends the quotation AFTER
         the customer already has a ticket (checks at quotation-send
         time).
    Silently does nothing if this ticket already has an Initial
    Quotation, or if the stored cost text can't be parsed - a failed
    auto-link should never block the action that triggered it.
    """
    from pricing.models import Quotation, PaymentTerms

    if Quotation.objects.filter(ticket=ticket, quotation_type='INITIAL').exists():
        return

    cost = parse_cost_text(inquiry.quotation_estimated_cost)
    if cost is None:
        return

    payment_terms = None
    if inquiry.quotation_payment_terms:
        payment_terms, _ = PaymentTerms.objects.get_or_create(
            description=inquiry.quotation_payment_terms
        )

    Quotation.objects.create(
        ticket=ticket,
        quotation_type='INITIAL',
        package_details=inquiry.quotation_package_details or '',
        estimated_cost=cost,
        payment_terms=payment_terms,
        notes=inquiry.quotation_message_to_customer or '',
    )