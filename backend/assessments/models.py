from django.db import models
from tickets.models import Ticket


class Assessment(models.Model):
    """
    The Partner Installer's on-site roof assessment for one Ticket.
    Matches the Roof Assessment Digital Form fields from Figma
    (Incoming Tickets Page > ticket detail > Roof Assessment Digital Form).
    """

    class RoofType(models.TextChoices):
        CONCRETE = 'CONCRETE', 'Concrete'
        METAL = 'METAL', 'Metal'
        SHINGLE = 'SHINGLE', 'Shingle'
        TILE = 'TILE', 'Tile'
        OTHER = 'OTHER', 'Other'

    class RoofCondition(models.TextChoices):
        GOOD = 'GOOD', 'Good'
        FAIR = 'FAIR', 'Fair'
        POOR = 'POOR', 'Poor'

    class SystemType(models.TextChoices):
        ON_GRID = 'ON_GRID', 'On Grid'
        HYBRID = 'HYBRID', 'Hybrid'

    # One assessment belongs to exactly one ticket
    ticket = models.OneToOneField(
        Ticket,
        on_delete=models.CASCADE,
        related_name='assessment',
    )

    # --- Fields from the Roof Assessment Digital Form ---
    estimated_roof_area_sqm = models.DecimalField(max_digits=8, decimal_places=2)
    roof_type = models.CharField(max_length=20, choices=RoofType.choices)
    roof_condition = models.CharField(max_length=10, choices=RoofCondition.choices)
    recommended_package = models.CharField(max_length=100)

    # Auto-filled when the Partner Installer selects a package
    recommended_system_type = models.CharField(max_length=20, choices=SystemType.choices)
    rated_capacity_kw = models.DecimalField(max_digits=6, decimal_places=2)

    number_of_solar_panels = models.PositiveIntegerField()
    inverter_size_kw = models.DecimalField(max_digits=6, decimal_places=2)

    # 500 character limit, matching the Figma notes field
    notes = models.CharField(max_length=500, blank=True)

    # --- Submission tracking ---
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Assessment for {self.ticket.ticket_number}"


class ProofOfVisitPhoto(models.Model):
    """
    One photo uploaded as proof of the on-site visit.
    A separate model because your Figma spec requires a MINIMUM of
    1 to 2 photos per assessment (i.e. multiple photos per assessment).
    """

    assessment = models.ForeignKey(
        Assessment,
        on_delete=models.CASCADE,
        related_name='photos',
    )
    image = models.ImageField(upload_to='proof_of_visit/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Photo for {self.assessment.ticket.ticket_number}"