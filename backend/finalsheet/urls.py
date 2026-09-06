from django.urls import path
from .views import TicketFeedbackView, FinalSheetPDFView, CompletionCertificatePDFView, AdminReportsPDFView

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
    path(
        'tickets/<int:pk>/completion-certificate/pdf/',
        CompletionCertificatePDFView.as_view(),
        name='completion-certificate-pdf',
    ),
    path(
        'tickets/reports/pdf/',
        AdminReportsPDFView.as_view(),
        name='admin-reports-pdf',
    ),
]