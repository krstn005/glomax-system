"""
Emergency switch for when someone (even an Admin) is locked out of
their 2-step login and has no backup codes left.

Usage (in the backend folder, with your virtual environment on):
    python manage.py reset_2fa <username>

The user will be asked to set up 2FA again on their next sign-in.
"""
from django.core.management.base import BaseCommand, CommandError

from accounts.models import User
from accounts.two_factor import reset_two_factor


class Command(BaseCommand):
    help = "Turns off 2-step login for one user so they can set it up again."

    def add_arguments(self, parser):
        parser.add_argument('username', type=str)

    def handle(self, *args, **options):
        username = options['username']
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f'No user named "{username}".')

        reset_two_factor(user)
        self.stdout.write(self.style.SUCCESS(
            f'2-step login was reset for "{username}". They will set it up again on their next sign-in.'
        ))