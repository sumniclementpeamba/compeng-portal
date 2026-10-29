from django.http import JsonResponse
from django.urls import include, path

# Import views from your apps
from accounts.views import (
    MemberAvatarView, MemberListView, MemberRoleUpdateView,
    MeAvatarView, MeView, NotificationListView,
    NotificationMarkAllReadView, NotificationMarkReadView,
    NotificationUnreadCountView, notification_stream,
)
from audit.views import AuditLogListView

def health_check(request):
    """A simple endpoint to confirm the service is running."""
    return JsonResponse({"status": "ok"})

urlpatterns = [
    # Health Check
    path("health/", health_check, name="health-check"),

    # Authentication & Profile
    path("auth/", include("accounts.urls")),
    path("me/", MeView.as_view(), name="me"),
    path("me/avatar/", MeAvatarView.as_view(), name="me-avatar"),

    # Notifications
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("notifications/unread-count/", NotificationUnreadCountView.as_view(), name="notifications-unread-count"),
    path("notifications/read-all/", NotificationMarkAllReadView.as_view(), name="notifications-read-all"),
    path("notifications/<int:pk>/read/", NotificationMarkReadView.as_view(), name="notifications-read"),
    path("notifications/stream/", notification_stream, name="notifications-stream"),

    # Resources, Announcements, and Admin
    path("resources/", include("resources.urls")),
    path("announcements/", include("announcements.urls")),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),

    # Member Management
    path("members/", MemberListView.as_view(), name="members"),
    path("members/<int:user_id>/avatar/", MemberAvatarView.as_view(), name="member-avatar"),
    path("members/<int:user_id>/role/", MemberRoleUpdateView.as_view(), name="member-role"),
] 