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
            'property_address',
            'contact_number',
            'preferred_date',
            'solar_package',
            'system_type',
        ]


class TicketSerializer(serializers.ModelSerializer):
    """
    Used for reading ticket data back - list view, detail view, and
    responses after create/withdraw/assign/decision actions.
    """

    ticket_number = serializers.ReadOnlyField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    customer_username = serializers.CharField(source='customer.username', read_only=True)
    partner_installer_username = serializers.CharField(
        source='partner_installer.username', read_only=True, default=None
    )

    class Meta:
        model = Ticket
        fields = [
            'id',
            'ticket_number',
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
            'created_at',
            'updated_at',
            'assigned_at',
            'withdrawn_at',
            'completed_at',
        ]
        read_only_fields = fields


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
        if ticket.status != Ticket.Status.ASSESSMENT_SUBMITTED:
            raise serializers.ValidationError(
                "A decision can only be made once the assessment has been submitted."
            )
        return attrs