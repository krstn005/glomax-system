from django.conf import settings
from django.db import models


class Ticket(models.Model):
    """
    Represents one customer's roof assessment / installation request,
    from the moment they submit a Schedule Request until it's
    Approved, Not Compatible, or Withdrawn.
    """

    class Status(models.TextChoices):
        REQUEST_SUBMITTED = 'REQUEST_SUBMITTED', 'Request Submitted'
        PARTNER_INSTALLER_ASSIGNED = 'PI_ASSIGNED', 'Partner Installer Assigned'
        ASSESSMENT_SUBMITTED = 'ASSESSMENT_SUBMITTED', 'Assessment Submitted'
        STAFF_REVIEW = 'STAFF_REVIEW', 'Staff Review'
        ADMIN_REVIEW = 'ADMIN_REVIEW', 'Admin Review'
        APPROVED = 'APPROVED', 'Approved'
        NOT_COMPATIBLE_CANNOT_PROCEED = 'NC_CANNOT_PROCEED', 'Not Compatible - Cannot Proceed'
        NOT_COMPATIBLE_CAN_REAPPLY = 'NC_CAN_REAPPLY', 'Not Compatible - Can Reapply'
        WITHDRAWN = 'WITHDRAWN', 'Withdrawn'
        COMPLETED = 'COMPLETED', 'Completed'

    class SystemType(models.TextChoices):
        ON_GRID = 'ON_GRID', 'On Grid'
        HYBRID = 'HYBRID', 'Hybrid'

    # Who submitted this request (from Schedule Request Form)
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tickets',
        limit_choices_to={'role': 'CUSTOMER'},
    )

    # Who's assigned to do the on-site visit (set by Staff, null until assigned)
    partner_installer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='assigned_tickets',
        limit_choices_to={'role': 'PARTNER_INSTALLER'},
        null=True,
        blank=True,
    )

    # --- Fields from the Submit Schedule Request Page (Figma: CST - NR) ---
    property_address = models.CharField(max_length=255)
    contact_number = models.CharField(max_length=20)
    preferred_date = models.DateField()  # requested by the Customer at submission
    solar_package = models.CharField(max_length=100)
    system_type = models.CharField(
        max_length=20,
        choices=SystemType.choices,
        blank=True,  # auto-filled once a package is selected
    )

    # --- Set by Staff on the Assign Partner Installer page ---
    visit_date = models.DateField(
        null=True,
        blank=True,
        help_text="Actual scheduled visit date, set by Staff when assigning a Partner Installer.",
    )

    # --- Status tracking (matches the Request Status timeline page) ---
    status = models.CharField(
        max_length=30,
        choices=Status.choices,
        default=Status.REQUEST_SUBMITTED,
    )

    # --- Timestamps for the status timeline ---
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Ticket #{self.id} - {self.customer.username} ({self.get_status_display()})"

    @property
    def ticket_number(self):
        """Displays as GLX-0001, GLX-0002, etc. for a friendlier ticket number."""
        return f"GLX-{self.id:04d}"