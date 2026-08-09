from rest_framework import serializers
from .models import Ticket


class TicketCreateSerializer(serializers.ModelSerializer):
    """
    Used when a Customer submits the Schedule Request form
    (Figma: CST - NR - 1/2/3 / Submit Request Page).

    `customer` is NOT included here - it's set automatically from the
    logged-in user in the view (perform_create), so a Customer can
    never submit a request on someone else's behalf.
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
    the response after creating/withdrawing a ticket. Includes
    read-only info that's useful for the Request Status / Dashboard
    pages (ticket_number, human-readable status label, customer's
    username, assigned partner installer if any).
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