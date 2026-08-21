from rest_framework import serializers
from tickets.models import Ticket
from .models import Quotation, PaymentTerms
from .models import Quotation, PaymentTerms, PriceHistory

class PriceHistorySerializer(serializers.ModelSerializer):
    """
    Read-only representation of a PriceHistory entry - used by both
    Staff's Active Prices page (filtered to is_active=True) and the
    future Admin/Staff Price History page (full log).
    """

    system_type_display = serializers.CharField(source='get_system_type_display', read_only=True)

    class Meta:
        model = PriceHistory
        fields = [
            'id',
            'package_name',
            'price',
            'rated_capacity_kw',
            'system_type',
            'system_type_display',
            'is_active',
            'date_added',
        ]
        read_only_fields = fields

class PaymentTermsSerializer(serializers.ModelSerializer):
    """
    Read-only list of existing Payment Terms, used to populate the
    dropdown on Staff's Updated Quotation form (Quotation Management
    page) - Staff picks from terms Admin has already defined, not
    free text.
    """

    class Meta:
        model = PaymentTerms
        fields = ['id', 'description', 'date_added']
        read_only_fields = fields


class QuotationSerializer(serializers.ModelSerializer):
    """
    Read-only representation of a Quotation - used both standalone
    (GET /api/tickets/<id>/quotations/) and nested inside TicketSerializer
    so the Customer Dashboard's Initial/Updated Quotation cards and
    Staff's Quotation Management page both get what they need in one call.
    """

    quotation_type_display = serializers.CharField(source='get_quotation_type_display', read_only=True)
    payment_terms_description = serializers.CharField(
        source='payment_terms.description', read_only=True, default=None
    )

    class Meta:
        model = Quotation
        fields = [
            'id',
            'quotation_type',
            'quotation_type_display',
            'package_details',
            'estimated_cost',
            'payment_terms_description',
            'notes',
            'sent_at',
        ]
        read_only_fields = fields


class QuotationCreateSerializer(serializers.ModelSerializer):
    """
    Used by Staff to send an Initial or Updated Quotation for a ticket
    (Email Inquiry page's "Send Initial Quotation" button, and Quotation
    Management page's "Updated Quotation" form). `ticket` is set in the
    view from the URL, not accepted here - a Staff member always sends a
    quotation for the specific ticket they're looking at, never an
    arbitrary one typed into the request body.

    An Updated Quotation can only be sent while the ticket is in one of
    the two moments Staff is allowed to revise pricing: right after the
    Partner Installer's assessment is submitted, or after Admin has
    returned the ticket for revision. This is enforced here (not just
    hidden in the UI) so the restriction can't be bypassed by calling
    the endpoint directly.
    """
    payment_terms_id = serializers.PrimaryKeyRelatedField(
        queryset=PaymentTerms.objects.all(),
        source='payment_terms',
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Quotation
        fields = [
            'quotation_type',
            'package_details',
            'estimated_cost',
            'payment_terms_id',
            'notes',
        ]

    def validate(self, attrs):
        ticket = self.context['ticket']

        if attrs.get('quotation_type') == 'UPDATED':
            allowed_statuses = (Ticket.Status.ASSESSMENT_SUBMITTED, Ticket.Status.STAFF_REVIEW)
            if ticket.status not in allowed_statuses:
                raise serializers.ValidationError(
                    "An Updated Quotation can only be sent after the Partner "
                    "Installer's assessment has been submitted, or after Admin "
                    "has returned the ticket for revision."
                )

        return attrs