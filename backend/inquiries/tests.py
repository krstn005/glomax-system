"""
Unit tests for the inquiries app (Landing Page inquiry form and the reply box).

How to run only these tests (from D:\\Project\\glomax-system\\backend):
    python manage.py test inquiries -v 2
"""
from django.test import SimpleTestCase

from inquiries.serializers import InquiryCreateSerializer, MessageCreateSerializer


class InquiryCreateSerializerTests(SimpleTestCase):
    """InquiryCreateSerializer - the public Landing Page inquiry form"""

    def valid_data(self, **changes):
        data = {
            "full_name": "Juan Dela Cruz",
            "email": "juan@example.com",
            "phone_number": "09171234567",
            "subject": "ROOF_ASSESSMENT",
            "message": "I want a roof assessment.",
        }
        data.update(changes)
        return data

    def test_ut77_valid_inquiry(self):
        serializer = InquiryCreateSerializer(data=self.valid_data())
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_ut78_missing_fields_are_rejected(self):
        serializer = InquiryCreateSerializer(data={})
        self.assertFalse(serializer.is_valid())
        for field in ("full_name", "email", "phone_number", "subject", "message"):
            self.assertIn(field, serializer.errors)

    def test_ut79_wrong_email_format_is_rejected(self):
        serializer = InquiryCreateSerializer(data=self.valid_data(email="juan.example.com"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_ut80_unknown_subject_is_rejected(self):
        serializer = InquiryCreateSerializer(data=self.valid_data(subject="HELLO"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("subject", serializer.errors)

    def test_ut81_empty_message_is_rejected(self):
        serializer = InquiryCreateSerializer(data=self.valid_data(message=""))
        self.assertFalse(serializer.is_valid())
        self.assertIn("message", serializer.errors)

    def test_ut82_full_name_150_characters_ok_151_rejected_boundary(self):
        self.assertTrue(InquiryCreateSerializer(data=self.valid_data(full_name="a" * 150)).is_valid())
        self.assertFalse(InquiryCreateSerializer(data=self.valid_data(full_name="a" * 151)).is_valid())

    def test_ut83_phone_number_20_characters_ok_21_rejected_boundary(self):
        self.assertTrue(InquiryCreateSerializer(data=self.valid_data(phone_number="1" * 20)).is_valid())
        self.assertFalse(InquiryCreateSerializer(data=self.valid_data(phone_number="1" * 21)).is_valid())


class MessageCreateSerializerTests(SimpleTestCase):
    """MessageCreateSerializer - the reply box in the inquiry conversation"""

    def test_ut84_normal_message_is_valid(self):
        self.assertTrue(MessageCreateSerializer(data={"content": "Hello, good day."}).is_valid())

    def test_ut85_empty_message_is_rejected(self):
        self.assertFalse(MessageCreateSerializer(data={"content": ""}).is_valid())

    def test_ut86_spaces_only_message_is_rejected(self):
        self.assertFalse(MessageCreateSerializer(data={"content": "     "}).is_valid())

    def test_ut87_message_4000_characters_ok_4001_rejected_boundary(self):
        self.assertTrue(MessageCreateSerializer(data={"content": "a" * 4000}).is_valid())
        self.assertFalse(MessageCreateSerializer(data={"content": "a" * 4001}).is_valid())