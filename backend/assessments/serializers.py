from rest_framework import serializers

from tickets.models import Ticket
from .models import Assessment, ProofOfVisitPhoto


class ProofOfVisitPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProofOfVisitPhoto
        fields = ['id', 'image', 'uploaded_at']
        read_only_fields = fields


class AssessmentSerializer(serializers.ModelSerializer):
    """
    Used for reading assessment data back - included in the response
    after a Partner Installer submits the Roof Assessment Digital Form.
    """

    roof_type_display = serializers.CharField(source='get_roof_type_display', read_only=True)
    roof_condition_display = serializers.CharField(source='get_roof_condition_display', read_only=True)
    recommended_system_type_display = serializers.CharField(
        source='get_recommended_system_type_display', read_only=True
    )
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
            'submitted_at',
            'photos',
        ]
        read_only_fields = fields


class AssessmentCreateSerializer(serializers.ModelSerializer):
    """
    Roof Assessment Digital Form submission by the Partner Installer.
    Sent as multipart/form-data because it includes 1-2 Proof of Visit
    Photos. The photo files themselves come from request.FILES rather
    than a declared field, since DRF has no clean "many files" field -
    they're validated and attached in validate()/create() instead.
    """

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
        ]

    def validate(self, attrs):
        ticket = self.context['ticket']
        if ticket.status != Ticket.Status.PARTNER_INSTALLER_ASSIGNED:
            raise serializers.ValidationError(
                "An assessment can only be submitted while the ticket is "
                "in Partner Installer Assigned status."
            )

        photos = self.context['request'].FILES.getlist('photos')
        if not (1 <= len(photos) <= 2):
            raise serializers.ValidationError(
                "Upload at least 1 and at most 2 Proof of Visit Photos."
            )
        return attrs

    def create(self, validated_data):
        ticket = self.context['ticket']
        assessment = Assessment.objects.create(ticket=ticket, **validated_data)

        photos = self.context['request'].FILES.getlist('photos')
        for photo in photos:
            ProofOfVisitPhoto.objects.create(assessment=assessment, image=photo)

        return assessment
