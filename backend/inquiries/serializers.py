from rest_framework import serializers
from .models import Inquiry


class InquiryCreateSerializer(serializers.ModelSerializer):
    """
    Used by the public Landing Page contact form - no login required.
    Matches: Full Name, Email Address, Phone Number, Subject
    (dropdown), Message.
    """

    class Meta:
        model = Inquiry
        fields = ['full_name', 'email', 'phone_number', 'subject', 'message']


class InquirySerializer(serializers.ModelSerializer):
    """
    Read-only representation for Staff's Email Inquiries page listing
    and detail/quotation view. Includes the saved Initial Quotation
    content (if one has already been sent) so the quotation page can
    reload and display it instead of showing an empty form.
    """

    subject_display = serializers.CharField(source='get_subject_display', read_only=True)

    class Meta:
        model = Inquiry
        fields = [
            'id',
            'full_name',
            'email',
            'phone_number',
            'subject',
            'subject_display',
            'message',
            'is_replied',
            'received_at',
            'quotation_sent',
            'quotation_package_details',
            'quotation_estimated_cost',
            'quotation_payment_terms',
            'quotation_message_to_customer',
            'quotation_sent_at',
        ]
        read_only_fields = fields


class InquirySendQuotationSerializer(serializers.Serializer):
    """
    Used by Staff's "Send Initial Quotation" action on the Email
    Inquiries page. Not tied to a Ticket/Quotation model - this
    inquiry has no ticket yet, so this just validates the email
    content before it's sent and saved onto the Inquiry itself.
    """

    package_details = serializers.CharField()
    estimated_cost = serializers.CharField()
    payment_terms = serializers.CharField()
    notes = serializers.CharField(required=False, allow_blank=True)