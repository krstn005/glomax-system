from django.contrib import admin
from .models import Assessment, ProofOfVisitPhoto


class ProofOfVisitPhotoInline(admin.TabularInline):
    """Shows photos directly inside the Assessment page, instead of a separate list."""
    model = ProofOfVisitPhoto
    extra = 1


@admin.register(Assessment)
class AssessmentAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'roof_type', 'roof_condition', 'recommended_package', 'submitted_at')
    list_filter = ('roof_type', 'roof_condition', 'recommended_system_type')
    inlines = [ProofOfVisitPhotoInline]