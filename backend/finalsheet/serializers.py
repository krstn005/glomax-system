from rest_framework import serializers
from .models import FinalSheet, Feedback


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


class FeedbackSerializer(serializers.ModelSerializer):
    """
    Read-only representation of a ticket's Feedback - used both
    standalone and nested inside TicketSerializer, and on Partner
    Installer's My Ratings page / Admin's Customer Feedback page.
    """

    rating_display = serializers.CharField(source='get_rating_display', read_only=True)
    highlights_display = serializers.SerializerMethodField()

    class Meta:
        model = Feedback
        fields = [
            'id',
            'rating',
            'rating_display',
            'comments',
            'highlights',
            'highlights_display',
            'submitted_at',
        ]
        read_only_fields = fields

    def get_highlights_display(self, obj):
        choices = dict(Feedback.Highlight.choices)
        return [choices.get(h, h) for h in obj.highlights]


class FeedbackCreateSerializer(serializers.ModelSerializer):
    """
    Used by the Customer to submit their rating, comment, and optional
    highlight tags on the Feedback page. `ticket` is set in the view
    from the URL, not accepted here.
    """

    class Meta:
        model = Feedback
        fields = [
            'rating',
            'comments',
            'highlights',
        ]