from django.conf import settings
from rest_framework import serializers

from tickets.models import Ticket
from .models import Assessment, ProofOfVisitPhoto
from .roof_engine import RoofEngineError, assess_roof, haversine_m


class ProofOfVisitPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProofOfVisitPhoto
        fields = ['id', 'image', 'uploaded_at']
        read_only_fields = fields


class AssessmentSerializer(serializers.ModelSerializer):
    """
    Used for reading assessment data back - included in the response
    after a Partner Installer submits the Roof Assessment Digital Form.
    Now also includes the site data, the location check and everything
    the system worked out (with the calculation steps).
    """

    roof_type_display = serializers.CharField(source='get_roof_type_display', read_only=True)
    roof_condition_display = serializers.CharField(source='get_roof_condition_display', read_only=True)
    recommended_system_type_display = serializers.CharField(
        source='get_recommended_system_type_display', read_only=True
    )
    roof_direction_display = serializers.CharField(source='get_roof_direction_display', read_only=True)
    shading_level_display = serializers.CharField(source='get_shading_level_display', read_only=True)
    suitability_rating_display = serializers.CharField(source='get_suitability_rating_display', read_only=True)
    photos = ProofOfVisitPhotoSerializer(many=True, read_only=True)

    class Meta:
        model = Assessment
        fields = [
            'id',
            'estimated_roof_area_sqm',
            'roof_type',
            'roof_type_display',
            'roof_condition',
            'roof_condition_display',
            'recommended_package',
            'recommended_system_type',
            'recommended_system_type_display',
            'rated_capacity_kw',
            'number_of_solar_panels',
            'inverter_size_kw',
            'notes',
            'roof_outline',
            'roof_tilt_degrees',
            'roof_direction',
            'roof_direction_display',
            'shading_level',
            'shading_level_display',
            'monthly_bill',
            'visit_latitude',
            'visit_longitude',
            'visit_distance_m',
            'visit_within_geofence',
            'computed_roof_area_sqm',
            'computed_usable_area_sqm',
            'computed_max_panels',
            'computed_sun_hours',
            'computed_needed_kw',
            'computed_package_kw',
            'computed_annual_kwh',
            'computed_monthly_savings',
            'computed_payback_years',
            'suitability_score',
            'suitability_rating',
            'suitability_rating_display',
            'calculation',
            'differs_from_recommendation',
            'submitted_at',
            'photos',
        ]
        read_only_fields = fields


class RoofPreviewSerializer(serializers.Serializer):
    """
    Site data sent by the Assessment Sheet while the Partner Installer is
    still measuring. Used only to show the result before sending. Nothing
    is saved.
    """
    roof_outline = serializers.JSONField()
    roof_tilt_degrees = serializers.DecimalField(max_digits=4, decimal_places=1, min_value=0, max_value=60)
    roof_direction = serializers.ChoiceField(choices=Assessment.RoofDirection.choices)
    shading_level = serializers.ChoiceField(choices=Assessment.ShadingLevel.choices)
    roof_condition = serializers.ChoiceField(choices=Assessment.RoofCondition.choices, default='GOOD')
    monthly_bill = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=0
    )
    system_type = serializers.ChoiceField(choices=Assessment.SystemType.choices, required=False)

    def run(self, ticket):
        """Runs the roof engine. Returns the result dictionary."""
        data = self.validated_data
        bill = data.get('monthly_bill') or ticket.monthly_bill
        try:
            return assess_roof(
                outline=data['roof_outline'],
                tilt_degrees=data['roof_tilt_degrees'],
                direction=data['roof_direction'],
                shading=data['shading_level'],
                roof_condition=data['roof_condition'],
                monthly_bill=bill,
                system_type=data.get('system_type') or ticket.system_type or 'ON_GRID',
            )
        except RoofEngineError as exc:
            raise serializers.ValidationError({'roof_outline': [str(exc)]})


class AssessmentCreateSerializer(serializers.ModelSerializer):
    """
    Roof Assessment Digital Form submission by the Partner Installer.
    Sent as multipart/form-data because it includes 1-2 Proof of Visit
    Photos. The photo files themselves come from request.FILES rather
    than a declared field, since DRF has no clean "many files" field -
    they're validated and attached in validate()/create() instead.

    The roof calculation is done again here on the server, from the site
    data. The numbers shown on the page are never trusted as they are.
    """

    roof_outline = serializers.JSONField()
    roof_tilt_degrees = serializers.DecimalField(max_digits=4, decimal_places=1, min_value=0, max_value=60)
    roof_direction = serializers.ChoiceField(choices=Assessment.RoofDirection.choices)
    shading_level = serializers.ChoiceField(choices=Assessment.ShadingLevel.choices)
    monthly_bill = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=0
    )
    visit_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    visit_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)

    class Meta:
        model = Assessment
        fields = [
            'estimated_roof_area_sqm',
            'roof_type',
            'roof_condition',
            'recommended_package',
            'recommended_system_type',
            'rated_capacity_kw',
            'number_of_solar_panels',
            'inverter_size_kw',
            'notes',
            'roof_outline',
            'roof_tilt_degrees',
            'roof_direction',
            'shading_level',
            'monthly_bill',
            'visit_latitude',
            'visit_longitude',
        ]

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status != Ticket.Status.PARTNER_INSTALLER_ASSIGNED:
            raise serializers.ValidationError(
                "An assessment can only be submitted while the ticket "
                "is in Partner Installer Assigned status."
            )

        photos = self.context['request'].FILES.getlist('photos')
        if not (1 <= len(photos) <= 2):
            raise serializers.ValidationError(
                "Upload at least 1 and at most 2 Proof of Visit Photos."
            )

        # Work out the roof result from the site data
        bill = attrs.get('monthly_bill') or ticket.monthly_bill
        try:
            result = assess_roof(
                outline=attrs['roof_outline'],
                tilt_degrees=attrs['roof_tilt_degrees'],
                direction=attrs['roof_direction'],
                shading=attrs['shading_level'],
                roof_condition=attrs['roof_condition'],
                monthly_bill=bill,
                system_type=attrs['recommended_system_type'],
            )
        except RoofEngineError as exc:
            raise serializers.ValidationError({'roof_outline': [str(exc)]})
        self._result = result
        self._bill = bill

        # Location check: was the Partner Installer near the customer's pin?
        self._distance = None
        self._within = None
        v_lat, v_lng = attrs.get('visit_latitude'), attrs.get('visit_longitude')
        if ticket.latitude is not None and ticket.longitude is not None and v_lat is not None and v_lng is not None:
            self._distance = round(haversine_m(float(ticket.latitude), float(ticket.longitude), float(v_lat), float(v_lng)))
            radius = int(getattr(settings, 'GEOFENCE_RADIUS_M', 150))
            self._within = self._distance <= radius
            if not self._within and getattr(settings, 'GEOFENCE_ENFORCE', False):
                raise serializers.ValidationError(
                    f"You are about {self._distance} meters from the customer's pin. "
                    f"Please go to the property (within {radius} meters) to send this assessment."
                )
        return attrs

    def create(self, validated_data):
        ticket = self.context['ticket']
        result = self._result

        chosen_kw = None
        try:
            chosen_kw = int(float(validated_data['recommended_package'].upper().split('KW')[0]))
        except (ValueError, IndexError):
            chosen_kw = None
        differs = chosen_kw != result['recommended_package_kw']

        assessment = Assessment.objects.create(
            ticket=ticket,
            computed_roof_area_sqm=result['roof_area_sqm'],
            computed_usable_area_sqm=result['usable_area_sqm'],
            computed_max_panels=result['max_panels'],
            computed_sun_hours=result['sun_hours'],
            computed_needed_kw=result['needed_kw'],
            computed_package_kw=result['recommended_package_kw'],
            computed_annual_kwh=result['annual_kwh'],
            computed_monthly_savings=result['monthly_savings'],
            computed_payback_years=result['payback_years'],
            suitability_score=result['suitability_score'],
            suitability_rating=result['suitability_rating'],
            calculation=result,
            differs_from_recommendation=differs,
            visit_distance_m=self._distance,
            visit_within_geofence=self._within,
            **{**validated_data, 'monthly_bill': self._bill},
        )

        photos = self.context['request'].FILES.getlist('photos')
        for photo in photos:
            ProofOfVisitPhoto.objects.create(assessment=assessment, image=photo)

        return assessment