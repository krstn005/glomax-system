from django.contrib import admin
from .models import PriceHistory, PaymentTerms, Quotation


@admin.register(PriceHistory)
class PriceHistoryAdmin(admin.ModelAdmin):
    list_display = ('package_name', 'price', 'rated_capacity_kw', 'system_type', 'is_active', 'date_added')
    list_filter = ('system_type', 'is_active')


@admin.register(PaymentTerms)
class PaymentTermsAdmin(admin.ModelAdmin):
    list_display = ('id', 'date_added')


@admin.register(Quotation)
class QuotationAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'quotation_type', 'estimated_cost', 'sent_at')
    list_filter = ('quotation_type',)