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
    and detail view.
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
        ]
        read_only_fields = fields