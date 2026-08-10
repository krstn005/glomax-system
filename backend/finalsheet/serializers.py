from rest_framework import serializers
from .models import FinalSheet


class FinalSheetSerializer(serializers.ModelSerializer):
    """
    Read-only representation of a ticket's FinalSheet, embedded inside
    TicketSerializer once a ticket is Approved. Matches the Completed
    Tickets page / export-as-PDF data on both the Staff and Admin sides.
    """

    approved_by_username = serializers.CharField(
        source='approved_by.username', read_only=True, default=None
    )

    class Meta:
        model = FinalSheet
        fields = [
            'id',
            'final_cost',
            'payment_terms_summary',
            'approved_by_username',
            'approved_at',
            'is_archived',
            'archived_at',
        ]
        read_only_fields = fields