"""
Unit tests for the pricing app.

How to run only these tests (from D:\\Project\\glomax-system\\backend):
    python manage.py test pricing -v 2
"""
from django.test import SimpleTestCase, TestCase

from accounts.models import User
from pricing.models import PriceHistory
from pricing.serializers import QuotationCreateSerializer
from pricing.utils import _split_terms
from tickets.models import Ticket


class SplitTermsTests(SimpleTestCase):
    """_split_terms() - pricing/utils.py (payment terms shown as a list)"""

    def test_ut65_split_normal_terms(self):
        self.assertEqual(_split_terms("50% down, 50% after"), ["50% down", "50% after"])

    def test_ut66_split_empty_or_none_gives_empty_list(self):
        self.assertEqual(_split_terms(""), [])
        self.assertEqual(_split_terms(None), [])

    def test_ut67_split_ignores_extra_commas_and_spaces(self):
        self.assertEqual(_split_terms(" , 30% down ,, 70% after , "), ["30% down", "70% after"])


class PriceHistoryTests(TestCase):
    """PriceHistory.save() - a new price becomes the only active price of its package"""

    def add_price(self, package, price, active=True):
        return PriceHistory.objects.create(
            package_name=package,
            price=price,
            rated_capacity_kw="6.00",
            system_type=PriceHistory.SystemType.ON_GRID,
            is_active=active,
        )

    def test_ut68_new_price_turns_old_price_of_same_package_inactive(self):
        old = self.add_price("6KW On-Grid", "250000")
        new = self.add_price("6KW On-Grid", "260000")
        old.refresh_from_db()
        self.assertFalse(old.is_active)
        self.assertTrue(new.is_active)

    def test_ut69_new_price_does_not_touch_other_packages(self):
        other = self.add_price("10KW Hybrid", "500000")
        self.add_price("6KW On-Grid", "250000")
        other.refresh_from_db()
        self.assertTrue(other.is_active)

    def test_ut70_saving_an_inactive_price_keeps_the_active_one(self):
        active = self.add_price("6KW On-Grid", "250000")
        self.add_price("6KW On-Grid", "240000", active=False)
        active.refresh_from_db()
        self.assertTrue(active.is_active)


class QuotationCreateSerializerTests(TestCase):
    """QuotationCreateSerializer - when an Updated Quotation may be sent"""

    def setUp(self):
        customer = User.objects.create_user(
            username="cust", password="Glomax#2026Test", role=User.Role.CUSTOMER
        )
        self.customer = customer

    def make_ticket(self, status):
        return Ticket.objects.create(
            customer=self.customer,
            property_address="123 Rizal St",
            contact_number="09171234567",
            solar_package="6KW On-Grid",
            system_type="ON_GRID",
            status=status,
        )

    def check(self, ticket, quotation_type):
        data = {
            "quotation_type": quotation_type,
            "package_details": "6KW On-Grid",
            "estimated_cost": "250000.00",
        }
        return QuotationCreateSerializer(data=data, context={"ticket": ticket})

    def test_ut71_updated_quotation_allowed_after_assessment_submitted(self):
        ticket = self.make_ticket(Ticket.Status.ASSESSMENT_SUBMITTED)
        serializer = self.check(ticket, "UPDATED")
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_ut72_updated_quotation_allowed_when_admin_returned_the_ticket(self):
        ticket = self.make_ticket(Ticket.Status.STAFF_REVIEW)
        self.assertTrue(self.check(ticket, "UPDATED").is_valid())

    def test_ut73_updated_quotation_rejected_before_assessment(self):
        ticket = self.make_ticket(Ticket.Status.REQUEST_SUBMITTED)
        self.assertFalse(self.check(ticket, "UPDATED").is_valid())

    def test_ut74_updated_quotation_rejected_while_waiting_for_admin(self):
        ticket = self.make_ticket(Ticket.Status.ADMIN_REVIEW)
        self.assertFalse(self.check(ticket, "UPDATED").is_valid())

    def test_ut75_initial_quotation_has_no_status_limit(self):
        ticket = self.make_ticket(Ticket.Status.REQUEST_SUBMITTED)
        self.assertTrue(self.check(ticket, "INITIAL").is_valid())

    def test_ut76_estimated_cost_with_letters_is_rejected(self):
        ticket = self.make_ticket(Ticket.Status.ASSESSMENT_SUBMITTED)
        data = {"quotation_type": "UPDATED", "package_details": "6KW", "estimated_cost": "two hundred"}
        serializer = QuotationCreateSerializer(data=data, context={"ticket": ticket})
        self.assertFalse(serializer.is_valid())
        self.assertIn("estimated_cost", serializer.errors)