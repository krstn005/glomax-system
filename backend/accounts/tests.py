"""
Unit tests for the accounts app.

How to run only these tests (from D:\\Project\\glomax-system\\backend):
    python manage.py test accounts -v 2

Each test name starts with its Unit Test ID (UT-xx) so the result can be
copied straight into the Unit Test Cases table of the capstone paper.
"""
from datetime import timedelta

from django.test import SimpleTestCase, TestCase
from django.utils import timezone

from accounts.models import PasswordChangeOTP, User
from accounts.serializers import RegisterSerializer, make_customer_username
from accounts.sms import mask_phone, normalize_ph_mobile
from accounts.two_factor import clean_code, is_six_digits, mask_email


class PhoneNumberTests(SimpleTestCase):
    """normalize_ph_mobile() and mask_phone() - accounts/sms.py"""

    def test_ut01_normalize_number_with_spaces(self):
        self.assertEqual(normalize_ph_mobile("0917 123 4567"), "09171234567")

    def test_ut02_normalize_number_with_plus_63(self):
        self.assertEqual(normalize_ph_mobile("+63 917 1234567"), "09171234567")

    def test_ut03_normalize_number_starting_with_639(self):
        self.assertEqual(normalize_ph_mobile("639171234567"), "09171234567")

    def test_ut04_normalize_number_without_leading_zero(self):
        self.assertEqual(normalize_ph_mobile("9171234567"), "09171234567")

    def test_ut05_normalize_number_too_short_is_rejected(self):
        self.assertEqual(normalize_ph_mobile("0917123"), "")

    def test_ut06_normalize_boundary_10_and_12_digits_starting_with_09(self):
        # one digit less and one digit more than the valid 11 digits
        self.assertEqual(normalize_ph_mobile("0917123456"), "")
        self.assertEqual(normalize_ph_mobile("091712345678"), "")

    def test_ut07_normalize_empty_or_none_is_rejected(self):
        self.assertEqual(normalize_ph_mobile(""), "")
        self.assertEqual(normalize_ph_mobile(None), "")

    def test_ut08_normalize_letters_only_is_rejected(self):
        self.assertEqual(normalize_ph_mobile("abcdefghijk"), "")

    def test_ut09_mask_phone_valid_number(self):
        self.assertEqual(mask_phone("09171234567"), "0917***4567")

    def test_ut10_mask_phone_invalid_number(self):
        self.assertEqual(mask_phone("12345"), "")


class TwoFactorHelperTests(SimpleTestCase):
    """mask_email(), is_six_digits(), clean_code() - accounts/two_factor.py"""

    def test_ut11_mask_email_normal(self):
        self.assertEqual(mask_email("juan.delacruz@gmail.com"), "ju***********@gmail.com")

    def test_ut12_mask_email_very_short_name_boundary(self):
        # a 2-letter name still shows at least 3 stars
        self.assertEqual(mask_email("ab@gmail.com"), "a***@gmail.com")

    def test_ut13_mask_email_without_at_sign(self):
        self.assertEqual(mask_email("not-an-email"), "")

    def test_ut14_six_digit_code_is_valid(self):
        self.assertTrue(is_six_digits("123456"))

    def test_ut15_five_digit_code_is_invalid(self):
        self.assertFalse(is_six_digits("12345"))

    def test_ut16_seven_digit_code_is_invalid(self):
        self.assertFalse(is_six_digits("1234567"))

    def test_ut17_letters_in_code_are_invalid(self):
        self.assertFalse(is_six_digits("12ab56"))

    def test_ut18_clean_code_removes_spaces(self):
        self.assertEqual(clean_code(" 123 456 "), "123456")


class CustomerUsernameTests(SimpleTestCase):
    """make_customer_username() - accounts/serializers.py"""

    def test_ut19_username_made_from_email(self):
        name = make_customer_username("juan@gmail.com")
        self.assertRegex(name, r"^juan_[0-9a-f]{6}$")

    def test_ut20_username_removes_symbols_and_is_unique(self):
        first = make_customer_username("juan.dela-cruz@gmail.com")
        second = make_customer_username("juan.dela-cruz@gmail.com")
        self.assertTrue(first.startswith("juandelacruz_"))
        self.assertNotEqual(first, second)


class RegisterSerializerTests(TestCase):
    """RegisterSerializer - accounts/serializers.py"""

    def valid_data(self, **changes):
        data = {
            "full_name": "Juan Dela Cruz",
            "email": "juan@example.com",
            "phone_number": "09171234567",
            "address": "Quezon City",
            "password": "Glomax#2026Test",
            "confirm_password": "Glomax#2026Test",
        }
        data.update(changes)
        return data

    def test_ut21_valid_registration_creates_a_customer(self):
        serializer = RegisterSerializer(data=self.valid_data())
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        self.assertEqual(user.role, User.Role.CUSTOMER)
        self.assertEqual(user.email, "juan@example.com")

    def test_ut22_passwords_that_do_not_match_are_rejected(self):
        serializer = RegisterSerializer(data=self.valid_data(confirm_password="Different#123"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("confirm_password", serializer.errors)

    def test_ut23_duplicate_email_is_rejected_even_with_different_letter_case(self):
        User.objects.create_user(username="old", email="juan@example.com", password="Glomax#2026Test")
        serializer = RegisterSerializer(data=self.valid_data(email="JUAN@Example.com"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)

    def test_ut24_one_letter_full_name_is_rejected(self):
        serializer = RegisterSerializer(data=self.valid_data(full_name="A"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("full_name", serializer.errors)

    def test_ut25_numbers_only_password_is_rejected(self):
        serializer = RegisterSerializer(data=self.valid_data(password="12345678", confirm_password="12345678"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)

    def test_ut26_wrong_email_format_is_rejected(self):
        serializer = RegisterSerializer(data=self.valid_data(email="juan-at-example"))
        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)


class PasswordChangeOTPTests(TestCase):
    """PasswordChangeOTP - accounts/models.py"""

    def make_otp(self, minutes_old):
        user = User.objects.create_user(username=f"otp{minutes_old}", password="Glomax#2026Test")
        otp = PasswordChangeOTP.objects.create(user=user, code="123456", new_password="x")
        # created_at is set automatically, so it is moved back with update()
        PasswordChangeOTP.objects.filter(pk=otp.pk).update(
            created_at=timezone.now() - timedelta(minutes=minutes_old)
        )
        otp.refresh_from_db()
        return otp

    def test_ut27_new_code_is_not_expired(self):
        self.assertFalse(self.make_otp(0).is_expired())

    def test_ut28_code_9_minutes_old_is_still_valid_boundary(self):
        self.assertFalse(self.make_otp(9).is_expired())

    def test_ut29_code_11_minutes_old_is_expired(self):
        self.assertTrue(self.make_otp(11).is_expired())

    def test_ut30_generated_code_has_six_digits(self):
        for _ in range(50):
            self.assertTrue(is_six_digits(PasswordChangeOTP.generate_code()))