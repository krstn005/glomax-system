from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """
    GET /api/notifications/  - the logged-in user's own notifications,
    newest first. Same endpoint for all 4 roles - each person only
    ever sees their own.
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)


class NotificationMarkReadView(APIView):
    """
    PATCH /api/notifications/<id>/read/  - marks one notification as
    read. Only works on the logged-in user's own notification.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, recipient=request.user)
        except Notification.DoesNotExist:
            return Response({"detail": "Notification not found."}, status=404)
        notification.is_read = True
        notification.save()
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    """
    PATCH /api/notifications/read-all/  - marks all of the logged-in
    user's unread notifications as read in one call (used by "Mark all
    as read" in the bell dropdown).
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"detail": "All notifications marked as read."})


class NotificationDeleteView(APIView):
    """
    DELETE /api/notifications/<id>/  - deletes one notification.
    Only works on the logged-in user's own notification, so one
    person can never delete another's. This is what powers the small
    "x" delete button next to each item in every portal's bell
    dropdown, so notifications don't pile up indefinitely.
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, recipient=request.user)
        except Notification.DoesNotExist:
            return Response({"detail": "Notification not found."}, status=404)
        notification.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationDeleteAllView(APIView):
    """
    DELETE /api/notifications/clear-all/  - deletes ALL of the
    logged-in user's notifications in one call. Powers "Clear all" in
    the bell dropdown, for clearing out a long backlog at once.
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        Notification.objects.filter(recipient=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)