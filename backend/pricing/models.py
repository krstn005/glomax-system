from django.db import models
from tickets.models import Ticket


class PriceHistory(models.Model):
    """
    Log of all solar package prices, past and present.
    Matches Admin's Price History page and Staff's read-only Active Prices page.
    The most recently added price for a package automatically becomes active.
    """

    class SystemType(models.TextChoices):
        ON_GRID = 'ON_GRID', 'On Grid'
        HYBRID = 'HYBRID', 'Hybrid'

    package_name = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    rated_capacity_kw = models.DecimalField(max_digits=6, decimal_places=2)
    system_type = models.CharField(max_length=20, choices=SystemType.choices)
    is_active = models.BooleanField(default=True)
    date_added = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_added']
        verbose_name_plural = 'Price History'

    def save(self, *args, **kwargs):
        # When a new price is added for a package, deactivate the old ones
        # for that same package - matches "most recently added becomes active"
        if self.is_active:
            PriceHistory.objects.filter(
                package_name=self.package_name, is_active=True
            ).update(is_active=False)
        super().save(*args, **kwargs)

    def __str__(self):
        status = "Active" if self.is_active else "Inactive"
        return f"{self.package_name} - ₱{self.price} ({status})"


class PaymentTerms(models.Model):
    """
    Log of all payment terms, past and present.
    Matches Admin's Payment Terms History page.
    """
    description = models.TextField()
    date_added = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date_added']
        verbose_name_plural = 'Payment Terms'

    def __str__(self):
        return f"Payment Terms ({self.date_added.strftime('%Y-%m-%d')})"


class Quotation(models.Model):
    """
    Tracks both the Initial Quotation (sent by Staff after an email inquiry,
    before an account even exists) and the Updated Quotation (sent after
    the Partner Installer's assessment is reviewed).
    Matches Staff's Quotation Management page and the Customer Dashboard's
    Initial Quotation / Updated Quotation cards.
    """

    class QuotationType(models.TextChoices):
        INITIAL = 'INITIAL', 'Initial Quotation'
        UPDATED = 'UPDATED', 'Updated Quotation'

    # A ticket can have multiple quotations over time (initial, updated,
    # updated again after a revision) - so this is a ForeignKey, not OneToOne
    ticket = models.ForeignKey(
        Ticket,
        on_delete=models.CASCADE,
        related_name='quotations',
    )

    quotation_type = models.CharField(max_length=10, choices=QuotationType.choices)

    package_details = models.CharField(max_length=255)
    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2)
    payment_terms = models.ForeignKey(
        PaymentTerms,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='quotations',
    )
    notes = models.TextField(blank=True)

    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-sent_at']

    def __str__(self):
        return f"{self.get_quotation_type_display()} for {self.ticket.ticket_number}"