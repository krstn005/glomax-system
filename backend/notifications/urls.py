from django.urls import path
from .views import (
    NotificationListView,
    NotificationMarkReadView,
    NotificationMarkAllReadView,
    NotificationDeleteView,
    NotificationDeleteAllView,
)

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification-list'),
    path('<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
    path('read-all/', NotificationMarkAllReadView.as_view(), name='notification-mark-all-read'),
    path('<int:pk>/', NotificationDeleteView.as_view(), name='notification-delete'),
    path('clear-all/', NotificationDeleteAllView.as_view(), name='notification-delete-all'),
]