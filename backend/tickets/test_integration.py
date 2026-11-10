"""
Integration tests for GLOMAX.

These tests check that the parts of the system work TOGETHER: the API
endpoints (views), the serializers, the models and the PostgreSQL
database, the notifications, and the emails. Each test calls the real
API addresses (for example /api/tickets/<id>/assign/) the same way the
React portals do.

How to run (from D:\\Project\\glomax-system\\backend):
    python manage.py test tickets.test_integration -v 2

What is replaced during the tests (so nothing real happens):
  - Emails go to a fake mail box that Django makes for tests.
  - Text messages (SMS) are replaced with a do-nothing function.
  - Uploaded photos are saved in a temporary folder that is deleted at the end.
  - The "updated quotation" email thread is replaced, and only checked
    that it was started.
"""
import shutil
import tempfile
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from accounts.models import User
from assessments.models import Assessment
from finalsheet.models import Feedback, FinalSheet
from inquiries.models import Inquiry, Message
from notifications.models import Notification
from pricing.models import Quotation
from tickets.models import CompletionPhoto, Ticket

PASSWORD = "Glomax#2026Test"
TEMP_MEDIA = tempfile.mkdtemp(prefix="glomax_test_media_")

# A real 1x1 picture, so the upload looks like a photo
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82"
)

TEST_STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


def photo(name="photo.png"):
    return SimpleUploadedFile(name, TINY_PNG, content_type="image/png")


@override_settings(MEDIA_ROOT=TEMP_MEDIA, STORAGES=TEST_STORAGES)
class IntegrationBase(APITestCase):
    """Makes one user for every role and replaces SMS with a do-nothing function."""

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        sms = mock.patch("tickets.views.send_ticket_sms", return_value=True)
        self.sms = sms.start()
        self.addCleanup(sms.stop)

        self.customer = self.make_user("customer1", User.Role.CUSTOMER, email="customer1@example.com")
        self.other_customer = self.make_user("customer2", User.Role.CUSTOMER, email="customer2@example.com")
        self.staff = self.make_user("staff1", User.Role.STAFF, email="staff1@example.com")
        self.admin = self.make_user("admin1", User.Role.ADMIN, email="admin1@example.com")
        self.installer = self.make_user("installer1", User.Role.PARTNER_INSTALLER, email="installer1@example.com")
        self.other_installer = self.make_user("installer2", User.Role.PARTNER_INSTALLER, email="installer2@example.com")

    def make_user(self, username, role, email):
        return User.objects.create_user(username=username, password=PASSWORD, role=role, email=email)

    def login_as(self, user):
        """Acts as this user. (The 2FA code step is tested separately in IT-01.)"""
        self.client = APIClient()
        self.client.force_authenticate(user=user)

    def make_ticket(self, status=Ticket.Status.REQUEST_SUBMITTED, **extra):
        data = dict(
            customer=self.customer,
            full_name="Juan Dela Cruz",
            property_address="123 Rizal St, Quezon City",
            contact_number="09171234567",
            solar_package="6KW On-Grid",
            system_type="ON_GRID",
            status=status,
        )
        data.update(extra)
        return Ticket.objects.create(**data)

    def make_assigned_ticket(self):
        return self.make_ticket(
            status=Ticket.Status.PARTNER_INSTALLER_ASSIGNED,
            partner_installer=self.installer,
            visit_date=timezone.localdate() + timedelta(days=3),
        )

    def ticket_payload(self):
        return {
            "full_name": "Juan Dela Cruz",
            "property_address": "123 Rizal St, Quezon City",
            "contact_number": "09171234567",
            "preferred_date": "2026-12-01",
            "solar_package": "6KW On-Grid",
            "system_type": "ON_GRID",
        }

    def assessment_payload(self, photos=2):
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
        data["photos"] = [photo(f"p{i}.png") for i in range(photos)]
        return data

    def notes_for(self, user, kind=None):
        found = Notification.objects.filter(recipient=user)
        return found.filter(kind=kind) if kind else found


# ---------------------------------------------------------------------
# Login and access control
# ---------------------------------------------------------------------
class AccessControlIntegrationTests(IntegrationBase):
    """accounts (login, 2FA step) + permissions + ticket endpoints"""

    def test_it01_correct_password_gives_a_2fa_step_and_no_tokens(self):
        response = APIClient().post("/api/accounts/login/", {"username": "staff1", "password": PASSWORD}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn(response.data["two_factor"], ("setup", "verify"))
        self.assertTrue(response.data["challenge_token"])
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_it02_wrong_password_is_rejected(self):
        response = APIClient().post("/api/accounts/login/", {"username": "staff1", "password": "wrong-pass"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_it03_staff_account_cannot_sign_in_on_the_customer_portal(self):
        response = APIClient().post(
            "/api/accounts/login/",
            {"username": "staff1", "password": PASSWORD, "portal": "CUSTOMER"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.data["wrong_portal"])

    def test_it04_request_without_login_is_rejected(self):
        response = APIClient().get("/api/tickets/")
        self.assertEqual(response.status_code, 401)

    def test_it05_customer_cannot_use_staff_endpoints(self):
        ticket = self.make_ticket()
        self.login_as(self.customer)
        self.assertEqual(self.client.get("/api/tickets/staff/").status_code, 403)
        body = {"partner_installer_id": self.installer.id, "visit_date": "2026-12-10"}
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket.id}/assign/", body, format="json").status_code, 403)
        self.assertEqual(
            self.client.patch(f"/api/tickets/{ticket.id}/decision/", {"decision": "FORWARD_TO_ADMIN"}, format="json").status_code,
            403,
        )

    def test_it06_only_admin_can_approve_a_ticket(self):
        ticket = self.make_ticket(status=Ticket.Status.ADMIN_REVIEW, partner_installer=self.installer)
        body = {"final_cost": "250000.00", "payment_terms_summary": "50% down, 50% after"}
        for user in (self.customer, self.staff, self.installer):
            self.login_as(user)
            response = self.client.patch(f"/api/tickets/{ticket.id}/approve/", body, format="json")
            self.assertEqual(response.status_code, 403, user.role)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.ADMIN_REVIEW)
        self.assertFalse(FinalSheet.objects.filter(ticket=ticket).exists())


# ---------------------------------------------------------------------
# Inquiry (Landing Page -> Staff -> quotation)
# ---------------------------------------------------------------------
class InquiryIntegrationTests(IntegrationBase):
    """inquiries + notifications + email + pricing (quotation) + tickets"""

    def inquiry_payload(self, email="customer1@example.com"):
        return {
            "full_name": "Juan Dela Cruz",
            "email": email,
            "phone_number": "09171234567",
            "subject": "ROOF_ASSESSMENT",
            "message": "I want a roof assessment.",
        }

    def quotation_payload(self):
        return {
            "package_details": "6KW On-Grid",
            "estimated_cost": "P250,000",
            "payment_terms": "50% down, 50% after",
            "notes": "Thank you for your interest.",
        }

    def make_inquiry(self, email="customer1@example.com"):
        return Inquiry.objects.create(
            full_name="Juan Dela Cruz", email=email, phone_number="09171234567",
            subject="ROOF_ASSESSMENT", message="I want a roof assessment.",
        )

    def test_it07_public_inquiry_is_saved_and_staff_are_notified(self):
        response = APIClient().post("/api/inquiries/", self.inquiry_payload(), format="json")
        self.assertEqual(response.status_code, 201)
        inquiry = Inquiry.objects.get()
        self.assertEqual(inquiry.email, "customer1@example.com")
        self.assertFalse(inquiry.quotation_sent)
        self.assertEqual(self.notes_for(self.staff, Notification.Kind.NEW_INQUIRY).count(), 1)
        self.assertEqual(self.notes_for(self.customer).count(), 0)

    def test_it08_invalid_public_inquiry_is_not_saved(self):
        bad = self.inquiry_payload(email="not-an-email")
        response = APIClient().post("/api/inquiries/", bad, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Inquiry.objects.count(), 0)

    def test_it09_staff_reply_is_saved_emailed_and_customer_account_is_notified(self):
        inquiry = self.make_inquiry()
        self.login_as(self.staff)
        response = self.client.post(f"/api/inquiries/staff/{inquiry.id}/messages/", {"content": "Hello, good day."}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["email_sent"])
        self.assertEqual(Message.objects.filter(inquiry=inquiry).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["customer1@example.com"])
        inquiry.refresh_from_db()
        self.assertTrue(inquiry.is_replied)
        self.assertEqual(self.notes_for(self.customer, Notification.Kind.INQUIRY_REPLY).count(), 1)

    def test_it10_customer_cannot_use_the_staff_reply_endpoint(self):
        inquiry = self.make_inquiry()
        self.login_as(self.customer)
        response = self.client.post(f"/api/inquiries/staff/{inquiry.id}/messages/", {"content": "Hi"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Message.objects.count(), 0)

    def test_it11_initial_quotation_is_emailed_and_saved_only_once(self):
        inquiry = self.make_inquiry()
        self.login_as(self.staff)
        url = f"/api/inquiries/staff/{inquiry.id}/send-quotation/"
        first = self.client.post(url, self.quotation_payload(), format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        inquiry.refresh_from_db()
        self.assertTrue(inquiry.quotation_sent)
        self.assertEqual(inquiry.quotation_estimated_cost, "P250,000")
        second = self.client.post(url, self.quotation_payload(), format="json")
        self.assertEqual(second.status_code, 400)
        self.assertEqual(len(mail.outbox), 1)

    def test_it12_quotation_sent_before_the_request_is_linked_to_the_new_ticket(self):
        inquiry = self.make_inquiry()
        self.login_as(self.staff)
        self.client.post(f"/api/inquiries/staff/{inquiry.id}/send-quotation/", self.quotation_payload(), format="json")
        self.login_as(self.customer)
        response = self.client.post("/api/tickets/", self.ticket_payload(), format="json")
        self.assertEqual(response.status_code, 201)
        quotation = Quotation.objects.get(ticket_id=response.data["id"])
        self.assertEqual(quotation.quotation_type, "INITIAL")
        self.assertEqual(str(quotation.estimated_cost), "250000.00")

    def test_it13_quotation_sent_after_the_request_is_linked_to_the_existing_ticket(self):
        ticket = self.make_ticket()
        inquiry = self.make_inquiry()
        self.login_as(self.staff)
        response = self.client.post(f"/api/inquiries/staff/{inquiry.id}/send-quotation/", self.quotation_payload(), format="json")
        self.assertEqual(response.status_code, 200)
        quotation = Quotation.objects.get(ticket=ticket)
        self.assertEqual(quotation.quotation_type, "INITIAL")
        self.assertEqual(str(quotation.estimated_cost), "250000.00")


# ---------------------------------------------------------------------
# Request -> installer -> assessment
# ---------------------------------------------------------------------
class RequestAndAssessmentIntegrationTests(IntegrationBase):
    """tickets + accounts + assessments + notifications + email"""

    def test_it14_customer_submits_a_request_and_staff_and_admin_are_notified(self):
        self.login_as(self.customer)
        response = self.client.post("/api/tickets/", self.ticket_payload(), format="json")
        self.assertEqual(response.status_code, 201)
        ticket = Ticket.objects.get(pk=response.data["id"])
        self.assertEqual(ticket.status, Ticket.Status.REQUEST_SUBMITTED)
        self.assertEqual(ticket.customer, self.customer)
        self.assertEqual(self.notes_for(self.staff, Notification.Kind.NEW_REQUEST).count(), 1)
        self.assertEqual(self.notes_for(self.admin, Notification.Kind.NEW_REQUEST).count(), 1)

    def test_it15_second_request_is_blocked_while_one_is_still_active(self):
        self.make_ticket()
        self.login_as(self.customer)
        response = self.client.post("/api/tickets/", self.ticket_payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Ticket.objects.filter(customer=self.customer).count(), 1)

    def test_it16_customer_can_withdraw_before_an_installer_is_assigned(self):
        ticket = self.make_ticket()
        self.login_as(self.customer)
        response = self.client.patch(f"/api/tickets/{ticket.id}/withdraw/")
        self.assertEqual(response.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.WITHDRAWN)

    def test_it17_customer_cannot_withdraw_after_an_installer_is_assigned(self):
        ticket = self.make_assigned_ticket()
        self.login_as(self.customer)
        response = self.client.patch(f"/api/tickets/{ticket.id}/withdraw/")
        self.assertEqual(response.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.PARTNER_INSTALLER_ASSIGNED)

    def test_it18_staff_assigns_an_installer(self):
        ticket = self.make_ticket()
        self.login_as(self.staff)
        body = {"partner_installer_id": self.installer.id, "visit_date": "2026-12-10"}
        response = self.client.patch(f"/api/tickets/{ticket.id}/assign/", body, format="json")
        self.assertEqual(response.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.PARTNER_INSTALLER_ASSIGNED)
        self.assertEqual(ticket.partner_installer, self.installer)
        self.assertEqual(str(ticket.visit_date), "2026-12-10")
        self.assertIsNotNone(ticket.assigned_at)
        self.assertEqual(self.notes_for(self.installer, Notification.Kind.TICKET_ASSIGNED).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["installer1@example.com"])

    def test_it19_assigned_ticket_shows_in_the_installer_list_only(self):
        self.make_assigned_ticket()
        self.login_as(self.installer)
        self.assertEqual(len(self.client.get("/api/tickets/installer/").data), 1)
        self.login_as(self.other_installer)
        self.assertEqual(len(self.client.get("/api/tickets/installer/").data), 0)

    def test_it20_assigning_a_customer_account_as_installer_is_rejected(self):
        ticket = self.make_ticket()
        self.login_as(self.staff)
        body = {"partner_installer_id": self.other_customer.id, "visit_date": "2026-12-10"}
        response = self.client.patch(f"/api/tickets/{ticket.id}/assign/", body, format="json")
        self.assertEqual(response.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.REQUEST_SUBMITTED)

    def test_it21_assigning_an_already_assigned_ticket_is_rejected(self):
        ticket = self.make_assigned_ticket()
        self.login_as(self.staff)
        body = {"partner_installer_id": self.other_installer.id, "visit_date": "2026-12-10"}
        response = self.client.patch(f"/api/tickets/{ticket.id}/assign/", body, format="json")
        self.assertEqual(response.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.partner_installer, self.installer)

    def test_it22_installer_submits_the_roof_assessment(self):
        ticket = self.make_assigned_ticket()
        self.login_as(self.installer)
        response = self.client.post(
            f"/api/assessments/tickets/{ticket.id}/submit/", self.assessment_payload(photos=2), format="multipart"
        )
        self.assertEqual(response.status_code, 201, response.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.ASSESSMENT_SUBMITTED)
        assessment = Assessment.objects.get(ticket=ticket)
        self.assertEqual(assessment.photos.count(), 2)
        self.assertEqual(assessment.roof_type, "TILE")
        self.assertEqual(self.notes_for(self.staff, Notification.Kind.ASSESSMENT_SUBMITTED).count(), 1)

    def test_it23_another_installer_cannot_submit_the_assessment(self):
        ticket = self.make_assigned_ticket()
        self.login_as(self.other_installer)
        response = self.client.post(
            f"/api/assessments/tickets/{ticket.id}/submit/", self.assessment_payload(), format="multipart"
        )
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Assessment.objects.filter(ticket=ticket).exists())

    def test_it24_assessment_without_photos_is_rejected_and_nothing_is_saved(self):
        ticket = self.make_assigned_ticket()
        self.login_as(self.installer)
        response = self.client.post(
            f"/api/assessments/tickets/{ticket.id}/submit/", self.assessment_payload(photos=0), format="multipart"
        )
        self.assertEqual(response.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.PARTNER_INSTALLER_ASSIGNED)
        self.assertFalse(Assessment.objects.filter(ticket=ticket).exists())

    def test_it25_assessment_cannot_be_submitted_twice(self):
        ticket = self.make_assigned_ticket()
        self.login_as(self.installer)
        url = f"/api/assessments/tickets/{ticket.id}/submit/"
        self.assertEqual(self.client.post(url, self.assessment_payload(), format="multipart").status_code, 201)
        second = self.client.post(url, self.assessment_payload(), format="multipart")
        self.assertEqual(second.status_code, 400)
        self.assertEqual(Assessment.objects.filter(ticket=ticket).count(), 1)


# ---------------------------------------------------------------------
# Staff review -> Admin approval -> completion -> feedback
# ---------------------------------------------------------------------
class ReviewApprovalAndFeedbackIntegrationTests(IntegrationBase):
    """tickets + pricing + finalsheet + notifications + email (PDF)"""

    def quotation_body(self):
        return {"quotation_type": "UPDATED", "package_details": "6KW On-Grid", "estimated_cost": "260000.00", "notes": "After the visit."}

    def approve_body(self):
        return {"final_cost": "260000.00", "payment_terms_summary": "50% down, 50% after"}

    def test_it26_staff_sends_an_updated_quotation_after_the_assessment(self):
        ticket = self.make_ticket(status=Ticket.Status.ASSESSMENT_SUBMITTED, partner_installer=self.installer)
        self.login_as(self.staff)
        with mock.patch("pricing.views.announce_updated_quotation") as announce:
            response = self.client.post(f"/api/tickets/{ticket.id}/quotations/", self.quotation_body(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Quotation.objects.filter(ticket=ticket, quotation_type="UPDATED").count(), 1)
        announce.assert_called_once()

    def test_it27_updated_quotation_is_rejected_before_the_assessment(self):
        ticket = self.make_ticket(status=Ticket.Status.REQUEST_SUBMITTED)
        self.login_as(self.staff)
        with mock.patch("pricing.views.announce_updated_quotation") as announce:
            response = self.client.post(f"/api/tickets/{ticket.id}/quotations/", self.quotation_body(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Quotation.objects.filter(ticket=ticket).count(), 0)
        announce.assert_not_called()

    def test_it28_customer_sees_own_quotations_but_not_other_customers(self):
        ticket = self.make_ticket(status=Ticket.Status.ASSESSMENT_SUBMITTED)
        Quotation.objects.create(ticket=ticket, quotation_type="UPDATED", package_details="6KW", estimated_cost="260000")
        self.login_as(self.customer)
        self.assertEqual(self.client.get(f"/api/tickets/{ticket.id}/quotations/").status_code, 200)
        self.login_as(self.other_customer)
        self.assertEqual(self.client.get(f"/api/tickets/{ticket.id}/quotations/").status_code, 403)

    def test_it29_staff_forwards_the_ticket_to_admin(self):
        ticket = self.make_ticket(status=Ticket.Status.ASSESSMENT_SUBMITTED, partner_installer=self.installer)
        self.login_as(self.staff)
        response = self.client.patch(f"/api/tickets/{ticket.id}/decision/", {"decision": "FORWARD_TO_ADMIN"}, format="json")
        self.assertEqual(response.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.ADMIN_REVIEW)
        self.assertEqual(self.notes_for(self.admin, Notification.Kind.ADMIN_REVIEW_READY).count(), 1)

    def test_it30_decision_is_rejected_before_the_assessment_is_submitted(self):
        ticket = self.make_assigned_ticket()
        self.login_as(self.staff)
        response = self.client.patch(f"/api/tickets/{ticket.id}/decision/", {"decision": "FORWARD_TO_ADMIN"}, format="json")
        self.assertEqual(response.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.PARTNER_INSTALLER_ASSIGNED)

    def test_it31_not_compatible_needs_a_reason(self):
        ticket = self.make_ticket(status=Ticket.Status.ASSESSMENT_SUBMITTED, partner_installer=self.installer)
        self.login_as(self.staff)
        response = self.client.patch(f"/api/tickets/{ticket.id}/decision/", {"decision": "NOT_COMPATIBLE_CANNOT", "reason": "  "}, format="json")
        self.assertEqual(response.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.ASSESSMENT_SUBMITTED)

    def test_it32_not_compatible_cannot_proceed_notifies_and_emails_the_customer(self):
        ticket = self.make_ticket(status=Ticket.Status.ASSESSMENT_SUBMITTED, partner_installer=self.installer)
        self.login_as(self.staff)
        body = {"decision": "NOT_COMPATIBLE_CANNOT", "reason": "The roof cannot carry the panels."}
        response = self.client.patch(f"/api/tickets/{ticket.id}/decision/", body, format="json")
        self.assertEqual(response.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.NOT_COMPATIBLE_CANNOT_PROCEED)
        self.assertEqual(ticket.not_compatible_reason, "The roof cannot carry the panels.")
        self.assertEqual(self.notes_for(self.customer, Notification.Kind.TICKET_DECISION).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["customer1@example.com"])
        self.assertFalse(ticket.can_reapply_now)

    def test_it33_can_reapply_makes_the_customer_wait_and_then_reuses_the_ticket(self):
        ticket = self.make_ticket(status=Ticket.Status.ASSESSMENT_SUBMITTED, partner_installer=self.installer)
        self.login_as(self.staff)
        body = {"decision": "NOT_COMPATIBLE_CAN_REAPPLY", "reason": "Roof repair needed first.", "reapply_days": 7}
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket.id}/decision/", body, format="json").status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.NOT_COMPATIBLE_CAN_REAPPLY)
        self.assertEqual(ticket.reapply_from, timezone.localdate() + timedelta(days=7))

        # The customer cannot send a new request before the date
        self.login_as(self.customer)
        early = self.client.post("/api/tickets/", self.ticket_payload(), format="json")
        self.assertEqual(early.status_code, 400)

        # Staff turns reapply on right away, then the same ticket is reused
        self.login_as(self.staff)
        enable = self.client.patch(f"/api/tickets/{ticket.id}/enable-reapply/", {"reapply_days": 0}, format="json")
        self.assertEqual(enable.status_code, 200)
        self.login_as(self.customer)
        again = self.client.post("/api/tickets/", self.ticket_payload(), format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.data["id"], ticket.id)
        self.assertTrue(again.data["reapplied"])
        self.assertEqual(Ticket.objects.filter(customer=self.customer).count(), 1)

    def test_it34_admin_returns_for_revision_then_staff_forwards_again(self):
        ticket = self.make_ticket(status=Ticket.Status.ADMIN_REVIEW, partner_installer=self.installer)
        self.login_as(self.admin)
        response = self.client.patch(f"/api/tickets/{ticket.id}/return-for-revision/", {"notes": "Please check the price."}, format="json")
        self.assertEqual(response.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.STAFF_REVIEW)
        self.assertEqual(ticket.admin_revision_notes, "Please check the price.")
        self.assertEqual(self.notes_for(self.staff, Notification.Kind.TICKET_RETURNED).count(), 1)

        self.login_as(self.staff)
        again = self.client.patch(f"/api/tickets/{ticket.id}/decision/", {"decision": "FORWARD_TO_ADMIN"}, format="json")
        self.assertEqual(again.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.ADMIN_REVIEW)
        self.assertIsNone(ticket.admin_revision_notes)

    def test_it35_admin_approves_and_the_customer_gets_the_disclosure_agreement(self):
        ticket = self.make_ticket(status=Ticket.Status.ADMIN_REVIEW, partner_installer=self.installer)
        self.login_as(self.admin)
        response = self.client.patch(f"/api/tickets/{ticket.id}/approve/", self.approve_body(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.APPROVED)
        sheet = FinalSheet.objects.get(ticket=ticket)
        self.assertEqual(str(sheet.final_cost), "260000.00")
        self.assertEqual(sheet.approved_by, self.admin)
        self.assertEqual(self.notes_for(self.customer, Notification.Kind.TICKET_APPROVED).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["customer1@example.com"])
        self.assertTrue(mail.outbox[0].attachments, "The approval email should have a PDF attached")

    def test_it36_approval_is_rejected_when_the_ticket_is_not_in_admin_review(self):
        ticket = self.make_ticket(status=Ticket.Status.ASSESSMENT_SUBMITTED, partner_installer=self.installer)
        self.login_as(self.admin)
        response = self.client.patch(f"/api/tickets/{ticket.id}/approve/", self.approve_body(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(FinalSheet.objects.filter(ticket=ticket).exists())

    def test_it37_final_sheet_pdf_opens_for_the_owner_only(self):
        ticket = self.make_ticket(status=Ticket.Status.ADMIN_REVIEW, partner_installer=self.installer)
        self.login_as(self.admin)
        self.client.patch(f"/api/tickets/{ticket.id}/approve/", self.approve_body(), format="json")

        self.login_as(self.customer)
        ok = self.client.get(f"/api/tickets/{ticket.id}/final-sheet/pdf/")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok["Content-Type"], "application/pdf")
        self.assertTrue(ok.content.startswith(b"%PDF"))

        self.login_as(self.other_customer)
        self.assertEqual(self.client.get(f"/api/tickets/{ticket.id}/final-sheet/pdf/").status_code, 403)

    def test_it38_installer_completes_an_approved_ticket_with_photos(self):
        ticket = self.make_ticket(status=Ticket.Status.APPROVED, partner_installer=self.installer)
        self.login_as(self.installer)
        response = self.client.patch(f"/api/tickets/{ticket.id}/complete/", {"photos": [photo(), photo("b.png")]}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.COMPLETED)
        self.assertIsNotNone(ticket.completed_at)
        self.assertEqual(CompletionPhoto.objects.filter(ticket=ticket).count(), 2)
        self.assertEqual(self.notes_for(self.customer, Notification.Kind.INSTALLATION_COMPLETED).count(), 1)

    def test_it39_completion_without_photos_or_before_approval_is_rejected(self):
        approved = self.make_ticket(status=Ticket.Status.APPROVED, partner_installer=self.installer)
        not_approved = self.make_ticket(status=Ticket.Status.ADMIN_REVIEW, partner_installer=self.installer, customer=self.other_customer)
        self.login_as(self.installer)
        no_photo = self.client.patch(f"/api/tickets/{approved.id}/complete/", {}, format="multipart")
        self.assertEqual(no_photo.status_code, 400)
        too_early = self.client.patch(f"/api/tickets/{not_approved.id}/complete/", {"photos": [photo()]}, format="multipart")
        self.assertEqual(too_early.status_code, 400)
        approved.refresh_from_db()
        self.assertEqual(approved.status, Ticket.Status.APPROVED)

    def test_it40_customer_feedback_is_saved_and_the_installer_is_notified(self):
        ticket = self.make_ticket(status=Ticket.Status.COMPLETED, partner_installer=self.installer)
        self.login_as(self.customer)
        body = {"rating": 5, "comments": "Great work!", "highlights": ["ON_TIME", "CLEAN_INSTALLATION"]}
        response = self.client.post(f"/api/tickets/{ticket.id}/feedback/", body, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        feedback = Feedback.objects.get(ticket=ticket)
        self.assertEqual(feedback.rating, 5)
        self.assertEqual(feedback.highlights, ["ON_TIME", "CLEAN_INSTALLATION"])
        self.assertEqual(self.notes_for(self.installer, Notification.Kind.FEEDBACK_SUBMITTED).count(), 1)

        # The installer and the Admin can read it, another customer cannot
        self.login_as(self.installer)
        self.assertEqual(self.client.get(f"/api/tickets/{ticket.id}/feedback/").status_code, 200)
        self.login_as(self.admin)
        self.assertEqual(self.client.get(f"/api/tickets/{ticket.id}/feedback/").status_code, 200)
        self.login_as(self.other_customer)
        self.assertEqual(self.client.get(f"/api/tickets/{ticket.id}/feedback/").status_code, 403)

    def test_it41_feedback_is_rejected_when_duplicate_early_or_from_another_customer(self):
        completed = self.make_ticket(status=Ticket.Status.COMPLETED, partner_installer=self.installer)
        early = self.make_ticket(status=Ticket.Status.ADMIN_REVIEW, customer=self.other_customer)
        self.login_as(self.customer)
        url = f"/api/tickets/{completed.id}/feedback/"
        self.assertEqual(self.client.post(url, {"rating": 4}, format="json").status_code, 201)
        self.assertEqual(self.client.post(url, {"rating": 5}, format="json").status_code, 400)
        self.assertEqual(Feedback.objects.filter(ticket=completed).count(), 1)

        self.login_as(self.other_customer)
        self.assertEqual(self.client.post(url, {"rating": 5}, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"/api/tickets/{early.id}/feedback/", {"rating": 5}, format="json").status_code, 400)

    def test_it42_feedback_with_a_rating_of_6_or_a_wrong_highlight_is_rejected(self):
        ticket = self.make_ticket(status=Ticket.Status.COMPLETED, partner_installer=self.installer)
        self.login_as(self.customer)
        url = f"/api/tickets/{ticket.id}/feedback/"
        self.assertEqual(self.client.post(url, {"rating": 6}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"rating": 5, "highlights": ["SUPER_COOL"]}, format="json").status_code, 400)
        self.assertFalse(Feedback.objects.filter(ticket=ticket).exists())


# ---------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------
class NotificationIntegrationTests(IntegrationBase):
    """notifications + accounts"""

    def test_it43_each_user_sees_only_their_own_notifications(self):
        Notification.objects.create(recipient=self.customer, kind=Notification.Kind.TICKET_APPROVED, message="Mine", link="/x")
        Notification.objects.create(recipient=self.other_customer, kind=Notification.Kind.TICKET_APPROVED, message="Not mine", link="/x")
        self.login_as(self.customer)
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        data = response.data["results"] if isinstance(response.data, dict) and "results" in response.data else response.data
        self.assertEqual([n["message"] for n in data], ["Mine"])

    def test_it44_user_can_mark_own_notification_as_read_but_not_someone_elses(self):
        mine = Notification.objects.create(recipient=self.customer, kind=Notification.Kind.TICKET_APPROVED, message="Mine", link="/x")
        theirs = Notification.objects.create(recipient=self.other_customer, kind=Notification.Kind.TICKET_APPROVED, message="Theirs", link="/x")
        self.login_as(self.customer)
        self.assertEqual(self.client.patch(f"/api/notifications/{mine.id}/read/").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/notifications/{theirs.id}/read/").status_code, 404)
        mine.refresh_from_db()
        theirs.refresh_from_db()
        self.assertTrue(mine.is_read)
        self.assertFalse(theirs.is_read)


# ---------------------------------------------------------------------
# The whole workflow, from inquiry to feedback
# ---------------------------------------------------------------------
class FullWorkflowIntegrationTest(IntegrationBase):
    """Every step of the main GLOMAX workflow, one after the other."""

    def test_it45_inquiry_to_completion_and_feedback(self):
        # 1. A visitor sends an inquiry from the Landing Page
        inquiry_body = {
            "full_name": "Juan Dela Cruz", "email": "customer1@example.com", "phone_number": "09171234567",
            "subject": "ROOF_ASSESSMENT", "message": "I want a roof assessment.",
        }
        self.assertEqual(APIClient().post("/api/inquiries/", inquiry_body, format="json").status_code, 201)
        inquiry = Inquiry.objects.get()

        # 2. Staff replies and sends the Initial Quotation
        self.login_as(self.staff)
        reply = self.client.post(f"/api/inquiries/staff/{inquiry.id}/messages/", {"content": "Good day!"}, format="json")
        self.assertEqual(reply.status_code, 201)
        quote = {"package_details": "6KW On-Grid", "estimated_cost": "P250,000", "payment_terms": "50% down, 50% after", "notes": ""}
        self.assertEqual(self.client.post(f"/api/inquiries/staff/{inquiry.id}/send-quotation/", quote, format="json").status_code, 200)

        # 3. The customer sends a request (the Initial Quotation is linked to it)
        self.login_as(self.customer)
        created = self.client.post("/api/tickets/", self.ticket_payload(), format="json")
        self.assertEqual(created.status_code, 201)
        ticket = Ticket.objects.get(pk=created.data["id"])
        self.assertEqual(Quotation.objects.filter(ticket=ticket, quotation_type="INITIAL").count(), 1)

        # 4. Staff assigns a Partner Installer
        self.login_as(self.staff)
        assign = {"partner_installer_id": self.installer.id, "visit_date": "2026-12-10"}
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket.id}/assign/", assign, format="json").status_code, 200)

        # 5. The Partner Installer submits the roof assessment
        self.login_as(self.installer)
        sent = self.client.post(f"/api/assessments/tickets/{ticket.id}/submit/", self.assessment_payload(), format="multipart")
        self.assertEqual(sent.status_code, 201, sent.data)

        # 6. Staff sends the Updated Quotation and forwards to Admin
        self.login_as(self.staff)
        updated = {"quotation_type": "UPDATED", "package_details": "6KW On-Grid", "estimated_cost": "260000.00"}
        with mock.patch("pricing.views.announce_updated_quotation"):
            self.assertEqual(self.client.post(f"/api/tickets/{ticket.id}/quotations/", updated, format="json").status_code, 201)
        forward = self.client.patch(f"/api/tickets/{ticket.id}/decision/", {"decision": "FORWARD_TO_ADMIN"}, format="json")
        self.assertEqual(forward.status_code, 200)

        # 7. Admin approves
        self.login_as(self.admin)
        approve = {"final_cost": "260000.00", "payment_terms_summary": "50% down, 50% after"}
        self.assertEqual(self.client.patch(f"/api/tickets/{ticket.id}/approve/", approve, format="json").status_code, 201)

        # 8. The Partner Installer marks the request completed
        self.login_as(self.installer)
        done = self.client.patch(f"/api/tickets/{ticket.id}/complete/", {"photos": [photo()]}, format="multipart")
        self.assertEqual(done.status_code, 200)

        # 9. The customer sends feedback
        self.login_as(self.customer)
        feedback = self.client.post(f"/api/tickets/{ticket.id}/feedback/", {"rating": 5, "comments": "Thank you!"}, format="json")
        self.assertEqual(feedback.status_code, 201)

        # The database now holds the whole story
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.COMPLETED)
        self.assertTrue(Assessment.objects.filter(ticket=ticket).exists())
        self.assertTrue(FinalSheet.objects.filter(ticket=ticket).exists())
        self.assertTrue(Feedback.objects.filter(ticket=ticket).exists())
        self.assertEqual(Quotation.objects.filter(ticket=ticket).count(), 2)
        self.assertGreaterEqual(self.notes_for(self.customer).count(), 3)