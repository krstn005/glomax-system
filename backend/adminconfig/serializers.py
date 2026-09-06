from rest_framework import serializers
from .models import SmsTemplate, SystemSetting, Faq


class SmsTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmsTemplate
        fields = ['id', 'name', 'message', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ['id', 'key', 'value', 'description', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class FaqSerializer(serializers.ModelSerializer):
    class Meta:
        model = Faq
        fields = ['id', 'question', 'answer', 'order', 'is_published', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class PublicFaqSerializer(serializers.ModelSerializer):
    """
    Read-only, published-only view for Customers - no is_published
    field exposed since a Customer has no use for that flag, and no
    write access at all.
    """
    class Meta:
        model = Faq
        fields = ['id', 'question', 'answer', 'order']
        read_only_fields = fields