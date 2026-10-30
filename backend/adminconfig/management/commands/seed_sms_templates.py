from django.core.management.base import BaseCommand

from adminconfig.models import SmsTemplate

TEMPLATES = [
    ('01 - Inquiry Received', 'Hi {customer_name}, thank you for contacting Glomax Solar. We got your inquiry and will send your quotation soon.'),
    ('02 - Initial Quotation Sent', 'Hi {customer_name}, your initial quotation for {package} is ready. Please check your email or open {link}'),
    ('03 - Quotation Follow-up', 'Hi {customer_name}, this is Glomax Solar. Do you have any questions about your quotation? Reply here: {link}'),
    ('04 - Staff Replied to Inquiry', 'Hi {customer_name}, Glomax Solar replied to your inquiry. Please open {link} to read the message.'),
    ('05 - Request Received', 'Hi {customer_name}, we received your request {ticket_number}. Our team will assign an installer for your roof visit.'),
    ('06 - Installer Assigned', 'Hi {customer_name}, an installer is assigned to request {ticket_number}. Roof visit date: {visit_date}.'),
    ('07 - Visit Reminder', 'Hi {customer_name}, reminder: our installer will visit your roof tomorrow, {visit_date}. Request {ticket_number}.'),
    ('08 - Reschedule Approved', 'Hi {customer_name}, your reschedule for {ticket_number} is approved. New visit date: {new_visit_date}.'),
    ('09 - Reschedule Declined', 'Hi {customer_name}, we could not approve your reschedule for {ticket_number}. Your visit stays on {visit_date}.'),
    ('10 - Assessment Under Review', 'Hi {customer_name}, the roof assessment for {ticket_number} is done and is now under review.'),
    ('11 - Request Approved', 'Hi {customer_name}, good news! Request {ticket_number} is approved. Your agreement was sent to your email.'),
    ('12 - Not Compatible - Cannot Proceed', 'Hi {customer_name}, sorry, your roof is not compatible for request {ticket_number}. Details were sent to your email.'),
    ('13 - Not Compatible - Can Reapply', 'Hi {customer_name}, request {ticket_number} is not compatible for now, but you may reapply. See your email for details.'),
    ('14 - Request Withdrawn', 'Hi {customer_name}, request {ticket_number} was withdrawn as you asked. You can send a new request anytime.'),
    ('15 - Request Completed', 'Hi {customer_name}, request {ticket_number} is now completed. Your certificate was sent to your email. Thank you!'),
    ('16 - Feedback Request', 'Hi {customer_name}, thank you for choosing Glomax Solar. Please share your feedback: {link}'),
    ('17 - Price Update', 'Glomax Solar update: prices were updated. Please check the latest prices at {link}'),
    ('18 - Payment Terms Update', 'Glomax Solar update: our payment terms were changed. Please read the new terms at {link}'),
    ('19 - Status Update', 'Hi {customer_name}, your request {ticket_number} is now {status}. Open {link} to see more.'),
]


class Command(BaseCommand):
    help = 'Adds ready-made SMS templates. Safe to run many times: same name is skipped.'

    def handle(self, *args, **options):
        added = 0
        skipped = 0
        for name, message in TEMPLATES:
            if SmsTemplate.objects.filter(name=name).exists():
                skipped += 1
                self.stdout.write('Skipped (already there): ' + name)
                continue
            SmsTemplate.objects.create(name=name, message=message, is_active=True)
            added += 1
            self.stdout.write('Added: ' + name)
        self.stdout.write(self.style.SUCCESS('Done. Added %d, skipped %d.' % (added, skipped)))
