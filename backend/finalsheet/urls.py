from django.urls import path
from .views import TicketFeedbackView, FinalSheetPDFView

urlpatterns = [
    path(
        'tickets/<int:pk>/feedback/',
        TicketFeedbackView.as_view(),
        name='ticket-feedback',
    ),
    path(
        'tickets/<int:pk>/final-sheet/pdf/',
        FinalSheetPDFView.as_view(),
        name='final-sheet-pdf',
    ),
]