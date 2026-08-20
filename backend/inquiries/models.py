from django.db import models


class Inquiry(models.Model):
    """
    A public inquiry submitted via the Landing Page's "Send Us an
    Inquiry" contact form. No account/login required to submit one.
    Matches Staff's Email Inquiries page.
    """

    class Subject(models.TextChoices):
        ROOF_ASSESSMENT = 'ROOF_ASSESSMENT', 'I want to request a roof assessment'
        PACKAGE_QUESTION = 'PACKAGE_QUESTION', 'I have a question about solar packages'
        OTHER = 'OTHER', 'Other concern'

    full_name = models.CharField(max_length=150)
    email = models.EmailField()
    phone_number = models.CharField(max_length=20)
    subject = models.CharField(max_length=20, choices=Subject.choices)
    message = models.TextField()

    is_replied = models.BooleanField(default=False)
    received_at = models.DateTimeField(auto_now_add=True)

    # The actual Initial Quotation that was sent, saved so Staff can
    # see it again later. quotation_sent is the real "already sent"
    # flag - is_replied is kept separately in case it's ever set some
    # other way.
    quotation_sent = models.BooleanField(default=False)
    quotation_package_details = models.CharField(max_length=255, blank=True, default='')
    quotation_estimated_cost = models.CharField(max_length=100, blank=True, default='')
    quotation_payment_terms = models.CharField(max_length=255, blank=True, default='')
    quotation_message_to_customer = models.TextField(blank=True, default='')
    quotation_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-received_at']
        verbose_name_plural = 'Inquiries'

    def __str__(self):
        return f"Inquiry from {self.full_name} ({self.get_subject_display()})"