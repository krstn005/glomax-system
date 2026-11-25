from django.db import models
from tickets.models import Ticket


class Assessment(models.Model):
    """
    The Partner Installer's on-site roof assessment for one Ticket.
    Matches the Roof Assessment Digital Form fields from Figma
    (Incoming Tickets Page > ticket detail > Roof Assessment Digital Form).

    The sheet now has two parts:
      - What the Partner Installer measured on site (roof outline, tilt,
        direction, shade, the customer's bill) and the final values they
        confirm (package, kW, panels, inverter).
      - What the system worked out from that site data (roof area, usable
        area, panels that fit, sunlight, savings, suitability score).
        It is made by roof_engine.py when the sheet is submitted and is
        saved together with every calculation step.
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

    class RoofDirection(models.TextChoices):
        SOUTH = 'S', 'South'
        SOUTH_EAST = 'SE', 'South-East'
        SOUTH_WEST = 'SW', 'South-West'
        EAST = 'E', 'East'
        WEST = 'W', 'West'
        NORTH_EAST = 'NE', 'North-East'
        NORTH_WEST = 'NW', 'North-West'
        NORTH = 'N', 'North'
        FLAT = 'FLAT', 'Flat roof'

    class ShadingLevel(models.TextChoices):
        NONE = 'NONE', 'No shade'
        LIGHT = 'LIGHT', 'Light shade'
        MODERATE = 'MODERATE', 'Moderate shade'
        HEAVY = 'HEAVY', 'Heavy shade'

    class Suitability(models.TextChoices):
        HIGH = 'HIGH', 'Highly suitable'
        MODERATE = 'MODERATE', 'Suitable with limits'
        LOW = 'LOW', 'Low suitability'

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

    # --- Site data measured by the Partner Installer ---
    # Corners of the roof, drawn on the map: [[lat, lng], [lat, lng], ...]
    roof_outline = models.JSONField(default=list, blank=True)
    roof_tilt_degrees = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    roof_direction = models.CharField(max_length=5, choices=RoofDirection.choices, blank=True)
    shading_level = models.CharField(max_length=10, choices=ShadingLevel.choices, blank=True)
    monthly_bill = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # --- Location check (geofence) ---
    # Where the Partner Installer's phone was when the sheet was sent, and
    # how far that is from the pin the customer put on the map.
    visit_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    visit_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    visit_distance_m = models.PositiveIntegerField(null=True, blank=True)
    visit_within_geofence = models.BooleanField(null=True, blank=True)

    # --- What the system worked out (see roof_engine.py) ---
    computed_roof_area_sqm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    computed_usable_area_sqm = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    computed_max_panels = models.PositiveIntegerField(null=True, blank=True)
    computed_sun_hours = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    computed_needed_kw = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    computed_package_kw = models.PositiveSmallIntegerField(null=True, blank=True)
    computed_annual_kwh = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    computed_monthly_savings = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    computed_payback_years = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    suitability_score = models.PositiveSmallIntegerField(null=True, blank=True)
    suitability_rating = models.CharField(max_length=10, choices=Suitability.choices, blank=True)
    # Every calculation step, so the result can be explained
    calculation = models.JSONField(default=dict, blank=True)

    # True when the Partner Installer chose a package that is different
    # from what the system recommended
    differs_from_recommendation = models.BooleanField(default=False)

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