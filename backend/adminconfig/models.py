from django.db import models


class SmsTemplate(models.Model):
    """
    A reusable SMS message template Admin can define and later use
    once SMS sending (Semaphore) is wired up. Supports named
    placeholders like {customer_name} that get filled in at send time
    - this model just stores the template text, it doesn't send
    anything itself yet.
    """
    name = models.CharField(max_length=100)
    message = models.TextField(
        help_text="Use placeholders like {customer_name}, {ticket_number}, {status}."
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class SystemSetting(models.Model):
    """
    Generic key-value store for simple system-wide configuration
    Admin can edit from the Settings > System tab, without needing a
    dedicated model/migration for every individual setting. Value is
    stored as text; the frontend decides how to interpret/display it
    based on the key.
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(blank=True)
    description = models.CharField(max_length=255, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return self.key


class Faq(models.Model):
    """
    A single frequently-asked-question entry, managed by Admin and
    shown to Customers. `order` lets Admin control display order
    without relying on creation date or alphabetical sorting.
    """
    question = models.CharField(max_length=255)
    answer = models.TextField()
    order = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.question