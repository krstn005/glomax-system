from django.conf import settings
from django.db import models


class Notification(models.Model):
    """
    A single notification for one user. Generic across all 4 roles -
    Customer, Staff, Partner Installer, and Admin all use the same
    model and the same bell dropdown pattern, just filtered to their
    own recipient.
    """

    class Kind(models.TextChoices):
        TICKET_ASSIGNED = 'TICKET_ASSIGNED', 'Ticket Assigned'
        ASSESSMENT_SUBMITTED = 'ASSESSMENT_SUBMITTED', 'Assessment Submitted'
        TICKET_DECISION = 'TICKET_DECISION', 'Ticket Decision'
        ADMIN_REVIEW_READY = 'ADMIN_REVIEW_READY', 'Ready for Admin Review'
        TICKET_APPROVED = 'TICKET_APPROVED', 'Ticket Approved'
        TICKET_RETURNED = 'TICKET_RETURNED', 'Returned for Revision'
        FEEDBACK_SUBMITTED = 'FEEDBACK_SUBMITTED', 'Feedback Submitted'
        WORKER_ACCOUNT = 'WORKER_ACCOUNT', 'Worker Account Change'
        INSTALLATION_COMPLETED = 'INSTALLATION_COMPLETED', 'Installation Completed'
        RESCHEDULE_REQUESTED = 'RESCHEDULE_REQUESTED', 'Reschedule Requested'
        RESCHEDULE_DECISION = 'RESCHEDULE_DECISION', 'Reschedule Decision'

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    kind = models.CharField(max_length=30, choices=Kind.choices)
    message = models.CharField(max_length=255)
    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.kind} -> {self.recipient.username}"