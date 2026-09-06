from django.urls import path
from .views import AssessmentSubmitView

urlpatterns = [
    path('tickets/<int:pk>/submit/', AssessmentSubmitView.as_view(), name='assessment-submit'),
]