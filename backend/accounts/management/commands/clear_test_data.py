"""
Clears the test data (requests, inquiries, notifications) so you can
start fresh for a demo or a defense.

It KEEPS: all accounts (customers, staff, installers, admin), package
prices, payment terms, FAQs, SMS templates and system settings.

Usage (in the backend folder, with your virtual environment on):

    python manage.py clear_test_data
        Only shows how many rows would be deleted. Nothing is deleted.

    python manage.py clear_test_data --yes
        Really deletes them. This cannot be undone.

    python manage.py clear_test_data --yes --customers
        Also deletes the CUSTOMER accounts (Staff, Installer and Admin
        accounts are never deleted by this command).

WARNING: it works on whatever database your .env points to. If
DATABASE_URL is set in .env, that is the ONLINE database. The command
prints the database name first, so check it before using --yes.
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from assessments.models import Assessment, ProofOfVisitPhoto
from finalsheet.models import Feedback, FinalSheet
from inquiries.models import Inquiry, Message
from notifications.models import Notification
from pricing.models import Quotation
from tickets.models import CompletionPhoto, RescheduleRequest, Ticket, TicketAttempt


class Command(BaseCommand):
    help = "Deletes requests, inquiries and notifications (keeps accounts, prices and settings)."

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Really delete. Without this, nothing is deleted.')
        parser.add_argument('--customers', action='store_true', help='Also delete CUSTOMER accounts.')

    def handle(self, *args, **options):
        db = settings.DATABASES['default']
        self.stdout.write(f"Database: {db.get('NAME')}  on  {db.get('HOST') or 'localhost'}")

        # Order matters: the things that depend on a ticket go first
        steps = [
            ('Notifications', Notification.objects.all()),
            ('Feedback', Feedback.objects.all()),
            ('Final sheets', FinalSheet.objects.all()),
            ('Completion photos', CompletionPhoto.objects.all()),
            ('Reschedule requests', RescheduleRequest.objects.all()),
            ('Ticket attempts (history)', TicketAttempt.objects.all()),
            ('Quotations', Quotation.objects.all()),
            ('Proof of visit photos', ProofOfVisitPhoto.objects.all()),
            ('Assessments', Assessment.objects.all()),
            ('Tickets (requests)', Ticket.objects.all()),
            ('Inquiry messages', Message.objects.all()),
            ('Inquiries', Inquiry.objects.all()),
        ]
        if options['customers']:
            steps.append(('Customer accounts', User.objects.filter(role=User.Role.CUSTOMER)))

        self.stdout.write('')
        for label, queryset in steps:
            self.stdout.write(f'  {label}: {queryset.count()}')
        self.stdout.write('')
        self.stdout.write('Kept: staff, installer and admin accounts, prices, payment terms, FAQs, SMS templates, settings.')
        if not options['customers']:
            self.stdout.write('Kept: customer accounts too (use --customers to delete them).')

        if not options['yes']:
            self.stdout.write(self.style.WARNING(
                '\nNothing was deleted. Check the database name above, then run again with --yes to delete.'
            ))
            return

        with transaction.atomic():
            for label, queryset in steps:
                queryset.delete()

        self.stdout.write(self.style.SUCCESS('\nDone. The test data was deleted.'))
        self.stdout.write(
            'Note: photos already uploaded to Cloudinary stay there. They are not shown anywhere in the system.'
        )
        