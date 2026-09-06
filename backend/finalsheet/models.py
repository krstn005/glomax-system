from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from tickets.models import Ticket


class FinalSheet(models.Model):
    """
    The final approved document, generated once the Admin approves a ticket.
    Matches: Admin's Completed Tickets page, Staff's Quotation Management
    export button, and the Customer's export/print final sheet button.
    """

    ticket = models.OneToOneField(
        Ticket,
        on_delete=models.CASCADE,
        related_name='final_sheet',
    )

    # Who approved it (must be an Admin)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='approved_final_sheets',
        limit_choices_to={'role': 'ADMIN'},
    )

    # Snapshot of the final numbers at time of approval - kept separate
    # from Quotation so this record never changes even if prices update later
    final_cost = models.DecimalField(max_digits=10, decimal_places=2)
    payment_terms_summary = models.TextField()

    approved_at = models.DateTimeField(auto_now_add=True)

    # Matches the Admin's "mark ticket as Completed and archive it" action
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Final Sheet for {self.ticket.ticket_number}"


class Feedback(models.Model):
    """
    Customer's star rating and comments after a ticket is Approved and Completed.
    Matches: Customer's Feedback Page, Partner Installer's My Ratings page,
    and Admin's Customer Feedback page.
    """

    class Rating(models.IntegerChoices):
        ONE_STAR = 1, '1 Star'
        TWO_STARS = 2, '2 Stars'
        THREE_STARS = 3, '3 Stars'
        FOUR_STARS = 4, '4 Stars'
        FIVE_STARS = 5, '5 Stars'

    class Highlight(models.TextChoices):
        PROFESSIONAL_TEAM = 'PROFESSIONAL_TEAM', 'Professional Team'
        ON_TIME = 'ON_TIME', 'On-Time'
        CLEAN_INSTALLATION = 'CLEAN_INSTALLATION', 'Clean Installation'
        QUALITY_MATERIALS = 'QUALITY_MATERIALS', 'Quality Materials'
        FRIENDLY_STAFF = 'FRIENDLY_STAFF', 'Friendly Staff'
        FAST_INSTALLATION = 'FAST_INSTALLATION', 'Fast Installation'

    # One feedback per ticket, since each completed ticket gets exactly
    # one rating from the customer
    ticket = models.OneToOneField(
        Ticket,
        on_delete=models.CASCADE,
        related_name='feedback',
    )

    rating = models.IntegerField(choices=Rating.choices)
    comments = models.TextField(blank=True)
    # Fixed list of positive highlights the Customer can optionally
    # tick when submitting feedback (matches the Highlight choices
    # above) - stored as a Postgres array since the list is fixed and
    # doesn't need its own table.
    highlights = ArrayField(
        models.CharField(max_length=30, choices=Highlight.choices),
        blank=True,
        default=list,
    )
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.rating} stars - {self.ticket.ticket_number}"