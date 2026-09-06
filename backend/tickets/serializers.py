from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Ticket, CompletionPhoto, RescheduleRequest

User = get_user_model()


class CompletionPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompletionPhoto
        fields = ['id', 'image', 'uploaded_at']


class RescheduleRequestSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = RescheduleRequest
        fields = [
            'id', 'requested_date', 'reason', 'status', 'status_display',
            'staff_response_note', 'created_at', 'resolved_at',
        ]
        read_only_fields = fields


class RescheduleRequestCreateSerializer(serializers.Serializer):
    """
    Customer's "Request Reschedule" form. Only allowed while the
    ticket is PI_ASSIGNED, and only if there isn't already a PENDING
    request for it.
    """
    requested_date = serializers.DateField()
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status != Ticket.Status.PARTNER_INSTALLER_ASSIGNED:
            raise serializers.ValidationError(
                "A reschedule can only be requested before your assessment visit takes place."
            )
        if ticket.reschedule_requests.filter(status=RescheduleRequest.Status.PENDING).exists():
            raise serializers.ValidationError(
                "You already have a pending reschedule request for this ticket."
            )
        return attrs


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
    responses after create/withdraw/assign/decision/approve/complete
    actions. Includes the nested assessment (Stage 3), final_sheet
    (Stage 4), quotations (Stage A), feedback (Stage B),
    completion_photos, and reschedule_requests when they exist, so the
    frontend gets the full picture in one call.
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
    completion_photos = serializers.SerializerMethodField()
    reschedule_requests = serializers.SerializerMethodField()

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
            'completion_photos',
            'reschedule_requests',
            'created_at',
            'updated_at',
            'assigned_at',
            'withdrawn_at',
            'completed_at',
        ]
        read_only_fields = fields

    def get_assessment(self, obj):
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

    def get_completion_photos(self, obj):
        return CompletionPhotoSerializer(obj.completion_photos.all(), many=True).data

    def get_reschedule_requests(self, obj):
        return RescheduleRequestSerializer(obj.reschedule_requests.all(), many=True).data


class TicketAssignSerializer(serializers.Serializer):
    partner_installer_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='PARTNER_INSTALLER', is_active=True),
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
    DECISION_CHOICES = (
        ('FORWARD_TO_ADMIN', 'Forward to Admin'),
        ('NOT_COMPATIBLE_CANNOT', 'Not Compatible - Cannot Proceed'),
        ('NOT_COMPATIBLE_CAN_REAPPLY', 'Not Compatible - Can Reapply'),
    )
    decision = serializers.ChoiceField(choices=DECISION_CHOICES)

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status not in (Ticket.Status.ASSESSMENT_SUBMITTED, Ticket.Status.STAFF_REVIEW):
            raise serializers.ValidationError(
                "A decision can only be made once the assessment has been submitted."
            )
        return attrs


class TicketApproveSerializer(serializers.Serializer):
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
    notes = serializers.CharField()

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status != Ticket.Status.ADMIN_REVIEW:
            raise serializers.ValidationError(
                "A ticket can only be returned for revision while it's in Admin Review status."
            )
        return attrs