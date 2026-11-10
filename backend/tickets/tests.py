"""
Unit tests for the tickets app.

How to run only these tests (from D:\\Project\\glomax-system\\backend):
    python manage.py test tickets -v 2
"""
from datetime import timedelta
from decimal import Decimal

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from accounts.models import User
from tickets.models import Ticket
from tickets.quotation_linking import parse_cost_text
from tickets.serializers import RescheduleRequestCreateSerializer, TicketCreateSerializer


class ParseCostTextTests(SimpleTestCase):
    """parse_cost_text() - tickets/quotation_linking.py"""

    def test_ut31_cost_with_letter_p_and_comma(self):
        self.assertEqual(parse_cost_text("P250,000"), Decimal("250000"))

    def test_ut32_cost_with_peso_sign_and_centavos(self):
        self.assertEqual(parse_cost_text("₱250,000.50"), Decimal("250000.50"))

    def test_ut33_plain_number_text(self):
        self.assertEqual(parse_cost_text("250000.50"), Decimal("250000.50"))

    def test_ut34_empty_or_none_returns_none(self):
        self.assertIsNone(parse_cost_text(""))
        self.assertIsNone(parse_cost_text(None))

    def test_ut35_text_without_numbers_returns_none(self):
        self.assertIsNone(parse_cost_text("to be discussed"))

    def test_ut36_two_decimal_points_returns_none(self):
        self.assertIsNone(parse_cost_text("1.2.3"))


class TicketModelTests(SimpleTestCase):
    """Ticket.ticket_number and Ticket.can_reapply_now - tickets/models.py"""

    def test_ut37_ticket_number_has_four_digits(self):
        self.assertEqual(Ticket(id=7).ticket_number, "GLX-0007")

    def test_ut38_ticket_number_with_five_digits_boundary(self):
        self.assertEqual(Ticket(id=12345).ticket_number, "GLX-12345")

    def test_ut39_withdrawn_ticket_can_reapply(self):
        self.assertTrue(Ticket(status=Ticket.Status.WITHDRAWN).can_reapply_now)

    def test_ut40_can_reapply_ticket_with_no_date_can_reapply_now(self):
        ticket = Ticket(status=Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY, reapply_from=None)
        self.assertTrue(ticket.can_reapply_now)

    def test_ut41_can_reapply_ticket_must_wait_until_tomorrow(self):
        tomorrow = timezone.localdate() + timedelta(days=1)
        ticket = Ticket(status=Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY, reapply_from=tomorrow)
        self.assertFalse(ticket.can_reapply_now)

    def test_ut42_can_reapply_ticket_on_the_reapply_date_boundary(self):
        ticket = Ticket(status=Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY, reapply_from=timezone.localdate())
        self.assertTrue(ticket.can_reapply_now)

    def test_ut43_cannot_proceed_ticket_cannot_reapply(self):
        self.assertFalse(Ticket(status=Ticket.Status.NOT_COMPATIBLE_CANNOT_PROCEED).can_reapply_now)

    def test_ut44_active_ticket_cannot_reapply(self):
        self.assertFalse(Ticket(status=Ticket.Status.REQUEST_SUBMITTED).can_reapply_now)


class TicketCreateSerializerTests(SimpleTestCase):
    """TicketCreateSerializer - the Schedule Request form"""

    def valid_data(self, **changes):
        data = {
            "full_name": "Juan Dela Cruz",
            "property_address": "123 Rizal St, Quezon City",
            "contact_number": "09171234567",
            "preferred_date": "2026-12-01",
            "solar_package": "6KW On-Grid",
            "system_type": "ON_GRID",
        }
        data.update(changes)
        return data

    def test_ut45_valid_request_form(self):
        serializer = TicketCreateSerializer(data=self.valid_data())
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_ut46_missing_required_fields_are_rejected(self):
        serializer = TicketCreateSerializer(data={"full_name": "Juan"})
        self.assertFalse(serializer.is_valid())
        for field in ("property_address", "contact_number", "solar_package"):
            self.assertIn(field, serializer.errors)
        # system_type is filled in automatically once a package is chosen,
        # so the form does not require it
        self.assertNotIn("system_type", serializer.errors)

    def test_ut47_unknown_system_type_is_rejected(self):
        serializer = TicketCreateSerializer(data=self.valid_data(system_type="OFF_GRID"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("system_type", serializer.errors)

    def test_ut48_wrong_date_format_is_rejected(self):
        serializer = TicketCreateSerializer(data=self.valid_data(preferred_date="next friday"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("preferred_date", serializer.errors)

    def test_ut49_preferred_date_is_optional(self):
        data = self.valid_data()
        del data["preferred_date"]
        self.assertTrue(TicketCreateSerializer(data=data).is_valid())

    def test_ut50_contact_number_20_characters_ok_21_rejected_boundary(self):
        self.assertTrue(TicketCreateSerializer(data=self.valid_data(contact_number="1" * 20)).is_valid())
        self.assertFalse(TicketCreateSerializer(data=self.valid_data(contact_number="1" * 21)).is_valid())


class RescheduleRequestSerializerTests(TestCase):
    """RescheduleRequestCreateSerializer - the Customer's Request Reschedule form"""

    def setUp(self):
        self.customer = User.objects.create_user(
            username="cust", password="Glomax#2026Test", role=User.Role.CUSTOMER
        )

    def make_ticket(self, status):
        return Ticket.objects.create(
            customer=self.customer,
            property_address="123 Rizal St",
            contact_number="09171234567",
            solar_package="6KW On-Grid",
            system_type="ON_GRID",
            status=status,
        )

    def check(self, ticket, **changes):
        data = {"requested_date": "2026-12-05", "reason": "Out of town"}
        data.update(changes)
        return RescheduleRequestCreateSerializer(data=data, context={"ticket": ticket})

    def test_ut51_reschedule_allowed_when_installer_is_assigned(self):
        ticket = self.make_ticket(Ticket.Status.PARTNER_INSTALLER_ASSIGNED)
        serializer = self.check(ticket)
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_ut52_reschedule_rejected_when_ticket_is_in_another_status(self):
        ticket = self.make_ticket(Ticket.Status.ASSESSMENT_SUBMITTED)
        self.assertFalse(self.check(ticket).is_valid())

    def test_ut53_second_pending_request_is_rejected(self):
        ticket = self.make_ticket(Ticket.Status.PARTNER_INSTALLER_ASSIGNED)
        ticket.reschedule_requests.create(requested_date="2026-12-03", reason="First")
        self.assertFalse(self.check(ticket).is_valid())

    def test_ut54_reason_255_characters_ok_256_rejected_boundary(self):
        ticket = self.make_ticket(Ticket.Status.PARTNER_INSTALLER_ASSIGNED)
        self.assertTrue(self.check(ticket, reason="a" * 255).is_valid())
        self.assertFalse(self.check(ticket, reason="a" * 256).is_valid())