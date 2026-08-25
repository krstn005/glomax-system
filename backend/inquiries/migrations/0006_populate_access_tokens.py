import uuid

from django.db import migrations


def populate_access_tokens(apps, schema_editor):
    Inquiry = apps.get_model('inquiries', 'Inquiry')
    for inquiry in Inquiry.objects.all():
        inquiry.access_token = uuid.uuid4()
        inquiry.save(update_fields=['access_token'])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inquiries', '0005_inquiry_access_token_inquiry_has_unread_reply_and_more'),
    ]

    operations = [
        migrations.RunPython(populate_access_tokens, reverse_noop),
    ]