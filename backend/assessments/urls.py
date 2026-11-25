from django.urls import path
from .views import AssessmentSubmitView, RoofPreviewView

urlpatterns = [
    path('tickets/<int:pk>/submit/', AssessmentSubmitView.as_view(), name='assessment-submit'),
    path('tickets/<int:pk>/preview/', RoofPreviewView.as_view(), name='assessment-preview'),
]