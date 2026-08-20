from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Ticket

User = get_user_model()


class TicketCreateSerializer(serializers.ModelSerializer):
    """
    Used when a Customer submits the Schedule Request form.
    """
    class Meta:
        model = Ticket
        fields = [
            'full_name',
            'property_address',
            'contact_number',
            'preferred_date',
            'solar_package',
            'system_type',
        ]


class TicketSerializer(serializers.ModelSerializer):
    """
    Used for reading ticket data back - list view, detail view, and
    responses after create/withdraw/assign/decision/approve actions.
    Includes the nested assessment (Stage 3), final_sheet (Stage 4),
    quotations (Stage A), and feedback (Stage B) when they exist, so
    the frontend gets the full picture in one call.
    """
    ticket_number = serializers.ReadOnlyField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    customer_username = serializers.CharField(source='customer.username', read_only=True)
    partner_installer_username = serializers.CharField(
        source='partner_installer.username', read_only=True, default=None
    )
    assessment = serializers.SerializerMethodField()
    final_sheet = serializers.SerializerMethodField()
    quotations = serializers.SerializerMethodField()
    feedback = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id',
            'ticket_number',
            'full_name',
            'customer_username',
            'partner_installer_username',
            'property_address',
            'contact_number',
            'preferred_date',
            'visit_date',
            'solar_package',
            'system_type',
            'status',
            'status_display',
            'admin_revision_notes',
            'assessment',
            'final_sheet',
            'quotations',
            'feedback',
            'created_at',
            'updated_at',
            'assigned_at',
            'withdrawn_at',
            'completed_at',
        ]
        read_only_fields = fields

    def get_assessment(self, obj):
        # Local import avoids a circular import between the tickets and
        # assessments apps (assessments imports Ticket already).
        from assessments.serializers import AssessmentSerializer
        assessment = getattr(obj, 'assessment', None)
        return AssessmentSerializer(assessment).data if assessment else None

    def get_final_sheet(self, obj):
        from finalsheet.serializers import FinalSheetSerializer
        final_sheet = getattr(obj, 'final_sheet', None)
        return FinalSheetSerializer(final_sheet).data if final_sheet else None

    def get_quotations(self, obj):
        from pricing.serializers import QuotationSerializer
        return QuotationSerializer(obj.quotations.all(), many=True).data

    def get_feedback(self, obj):
        from finalsheet.serializers import FeedbackSerializer
        feedback = getattr(obj, 'feedback', None)
        return FeedbackSerializer(feedback).data if feedback else None


class TicketAssignSerializer(serializers.Serializer):
    """
    Assign Partner Installer page - Staff picks a Partner Installer
    and sets the Visit Date.
    """
    partner_installer_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='PARTNER_INSTALLER'),
        source='partner_installer',
    )
    visit_date = serializers.DateField()

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status != Ticket.Status.REQUEST_SUBMITTED:
            raise serializers.ValidationError(
                "A Partner Installer can only be assigned while the ticket "
                "is still in Request Submitted status."
            )
        return attrs


class TicketDecisionSerializer(serializers.Serializer):
    """
    Assessment Review page - Staff's decision after reviewing the
    Partner Installer's submitted assessment.
    """
    DECISION_CHOICES = (
        ('FORWARD_TO_ADMIN', 'Forward to Admin'),
        ('NOT_COMPATIBLE_CANNOT', 'Not Compatible - Cannot Proceed'),
        ('NOT_COMPATIBLE_CAN_REAPPLY', 'Not Compatible - Can Reapply'),
    )
    decision = serializers.ChoiceField(choices=DECISION_CHOICES)

    def validate(self, attrs):
        ticket = self.context['ticket']
        # Allow from ASSESSMENT_SUBMITTED (first pass) or STAFF_REVIEW
        # (after Staff adjusts the quotation following an Admin
        # Return for Revision, then resubmits).
        if ticket.status not in (Ticket.Status.ASSESSMENT_SUBMITTED, Ticket.Status.STAFF_REVIEW):
            raise serializers.ValidationError(
                "A decision can only be made once the assessment has been submitted."
            )
        return attrs


class TicketApproveSerializer(serializers.Serializer):
    """
    Pending Approval page - Admin's Approve action. Creates the
    FinalSheet snapshot. final_cost and payment_terms_summary are
    provided directly for now, since the Quotation workflow (pricing
    app) isn't wired into Tickets yet.
    """
    final_cost = serializers.DecimalField(max_digits=10, decimal_places=2)
    payment_terms_summary = serializers.CharField()

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status != Ticket.Status.ADMIN_REVIEW:
            raise serializers.ValidationError(
                "A ticket can only be approved while it's in Admin Review status."
            )
        return attrs


class TicketReturnForRevisionSerializer(serializers.Serializer):
    """
    Pending Approval page - Admin's Return for Revision action. Sends
    the ticket back to Staff with notes explaining what needs fixing.
    """
    notes = serializers.CharField()

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status != Ticket.Status.ADMIN_REVIEW:
            raise serializers.ValidationError(
                "A ticket can only be returned for revision while it's in Admin Review status."
            )
        return attrs