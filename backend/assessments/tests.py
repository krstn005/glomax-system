"""
Unit tests for the assessments app (the Partner Installer's roof assessment form).

How to run only these tests (from D:\\Project\\glomax-system\\backend):
    python manage.py test assessments -v 2
"""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import RequestFactory, TestCase

from accounts.models import User
from assessments.serializers import AssessmentCreateSerializer
from tickets.models import Ticket


class AssessmentCreateSerializerTests(TestCase):
    """AssessmentCreateSerializer - assessments/serializers.py"""

    def setUp(self):
        customer = User.objects.create_user(
            username="cust", password="Glomax#2026Test", role=User.Role.CUSTOMER
        )
        self.ticket = Ticket.objects.create(
            customer=customer,
            property_address="123 Rizal St",
            contact_number="09171234567",
            solar_package="6KW On-Grid",
            system_type="ON_GRID",
            status=Ticket.Status.PARTNER_INSTALLER_ASSIGNED,
        )

    def valid_data(self, **changes):
        data = {
            "estimated_roof_area_sqm": "45.50",
            "roof_type": "TILE",
            "roof_condition": "GOOD",
            "recommended_package": "6KW On-Grid",
            "recommended_system_type": "ON_GRID",
            "rated_capacity_kw": "6.00",
            "number_of_solar_panels": 12,
            "inverter_size_kw": "5.00",
            "notes": "Roof is clear of shade.",
        }
        data.update(changes)
        return data

    def check(self, photos=1, ticket=None, **changes):
        files = [SimpleUploadedFile(f"p{i}.jpg", b"fake", content_type="image/jpeg") for i in range(photos)]
        request = RequestFactory().post("/fake/", {"photos": files})
        return AssessmentCreateSerializer(
            data=self.valid_data(**changes),
            context={"ticket": ticket or self.ticket, "request": request},
        )

    def test_ut55_valid_assessment_with_one_photo(self):
        serializer = self.check(photos=1)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_ut56_valid_assessment_with_two_photos_boundary(self):
        serializer = self.check(photos=2)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_ut57_no_photo_is_rejected_boundary(self):
        self.assertFalse(self.check(photos=0).is_valid())

    def test_ut58_three_photos_are_rejected_boundary(self):
        self.assertFalse(self.check(photos=3).is_valid())

    def test_ut59_assessment_rejected_when_ticket_is_not_installer_assigned(self):
        self.ticket.status = Ticket.Status.ASSESSMENT_SUBMITTED
        self.ticket.save()
        self.assertFalse(self.check().is_valid())

    def test_ut60_missing_roof_type_is_rejected(self):
        data = self.valid_data()
        del data["roof_type"]
        files = [SimpleUploadedFile("p.jpg", b"fake", content_type="image/jpeg")]
        request = RequestFactory().post("/fake/", {"photos": files})
        serializer = AssessmentCreateSerializer(data=data, context={"ticket": self.ticket, "request": request})
        self.assertFalse(serializer.is_valid())
        self.assertIn("roof_type", serializer.errors)

    def test_ut61_unknown_roof_type_is_rejected(self):
        serializer = self.check(roof_type="WOOD")
        self.assertFalse(serializer.is_valid())
        self.assertIn("roof_type", serializer.errors)

    def test_ut62_negative_number_of_panels_is_rejected(self):
        serializer = self.check(number_of_solar_panels=-1)
        self.assertFalse(serializer.is_valid())
        self.assertIn("number_of_solar_panels", serializer.errors)

    def test_ut63_notes_500_characters_ok_501_rejected_boundary(self):
        self.assertTrue(self.check(notes="a" * 500).is_valid())
        self.assertFalse(self.check(notes="a" * 501).is_valid())

    def test_ut64_roof_area_largest_allowed_value_boundary(self):
        # the field allows 8 digits in total, 2 of them after the decimal point
        self.assertTrue(self.check(estimated_roof_area_sqm="999999.99").is_valid())
        self.assertFalse(self.check(estimated_roof_area_sqm="1000000.00").is_valid())