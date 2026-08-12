from django.urls import path
from .views import TicketFeedbackView

urlpatterns = [
    path(
        'tickets/<int:pk>/feedback/',
        TicketFeedbackView.as_view(),
        name='ticket-feedback',
    ),
]