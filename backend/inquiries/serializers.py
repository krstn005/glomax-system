from rest_framework import serializers

from .models import Inquiry, Message


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
    reload and display it instead of showing an empty form. Also
    includes has_unread_reply so the list page can show a badge for
    inquiries with a new customer follow-up message.
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
            'has_unread_reply',
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


class MessageSerializer(serializers.ModelSerializer):
    """
    Read-only representation of one follow-up message in an Inquiry's
    thread. Used both on the public reply-link page and on Staff's
    thread view - same shape for both, since the conversation itself
    should look identical from either side.
    """

    sender_type_display = serializers.CharField(source='get_sender_type_display', read_only=True)
    staff_username = serializers.CharField(source='staff_user.username', read_only=True, default=None)

    class Meta:
        model = Message
        fields = [
            'id',
            'sender_type',
            'sender_type_display',
            'staff_username',
            'content',
            'sent_at',
        ]
        read_only_fields = fields


class MessageCreateSerializer(serializers.Serializer):
    """
    Used to submit a new follow-up message - by the Customer via the
    public reply-link page, or by Staff via the Email Inquiries thread
    view. Which one is happening is decided by the view, not this
    serializer - this only validates the message content itself.
    """

    content = serializers.CharField(max_length=4000, trim_whitespace=True)

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError("Message cannot be empty.")
        return value


class PublicInquiryThreadSerializer(serializers.ModelSerializer):
    """
    What the public, no-login reply-link page sees. Deliberately a
    SEPARATE serializer from InquirySerializer (Staff's version) so
    the public page never accidentally exposes anything beyond what
    the customer should see - no internal Staff-only fields, and
    definitely never the access_token or database id here, since this
    serializer's output IS what an attacker could see if they somehow
    reached the endpoint without a valid token (they can't, but this
    keeps the exposed surface deliberately minimal regardless).
    """

    subject_display = serializers.CharField(source='get_subject_display', read_only=True)
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Inquiry
        fields = [
            'full_name',
            'subject_display',
            'message',
            'received_at',
            'quotation_sent',
            'quotation_package_details',
            'quotation_estimated_cost',
            'quotation_payment_terms',
            'quotation_message_to_customer',
            'quotation_sent_at',
            'messages',
        ]
        read_only_fields = fields