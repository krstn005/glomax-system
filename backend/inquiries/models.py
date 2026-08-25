import uuid

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

    # Public reply-link security. UUID4 is unguessable - this is the
    # entire access control for the public thread page, since there's
    # no login. The Reply Link sent in every Staff email uses this
    # token, never the database id, to look up the inquiry.
    access_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    # Staff-facing in-app notification flag. Set True when the
    # customer submits a follow-up message via the public reply page,
    # reset to False once Staff opens the thread and views it.
    has_unread_reply = models.BooleanField(default=False)

    class Meta:
        ordering = ['-received_at']
        verbose_name_plural = 'Inquiries'

    def __str__(self):
        return f"Inquiry from {self.full_name} ({self.get_subject_display()})"


class Message(models.Model):
    """
    A single follow-up message in an Inquiry's conversation thread,
    sent either by Staff (inside the system) or the Customer (via the
    public reply-link page, no login required).

    This is ONLY for follow-up conversation, after the Initial
    Quotation - the quotation itself stays exactly where it already
    is (Inquiry.quotation_* fields above). The thread UI shows: the
    original inquiry message, then the quotation, then these Messages
    in order after it.
    """

    class SenderType(models.TextChoices):
        STAFF = 'STAFF', 'Staff'
        CUSTOMER = 'CUSTOMER', 'Customer'

    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE, related_name='messages')
    sender_type = models.CharField(max_length=10, choices=SenderType.choices)

    # Only set when sender_type is STAFF - which staff member sent it.
    # SET_NULL (not CASCADE) so a deleted Staff account doesn't wipe
    # out their past messages from the thread's history.
    staff_user = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True
    )

    content = models.TextField()
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sent_at']

    def __str__(self):
        return f"{self.get_sender_type_display()} message on Inquiry #{self.inquiry_id}"