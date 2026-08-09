from django.contrib import admin
from .models import Ticket


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ('ticket_number', 'customer', 'partner_installer', 'status', 'preferred_date', 'created_at')
    list_filter = ('status', 'system_type')
    search_fields = ('customer__username', 'property_address')