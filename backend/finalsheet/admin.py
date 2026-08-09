from django.contrib import admin
from .models import FinalSheet, Feedback


@admin.register(FinalSheet)
class FinalSheetAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'final_cost', 'approved_by', 'approved_at', 'is_archived')
    list_filter = ('is_archived',)


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'rating', 'submitted_at')
    list_filter = ('rating',)