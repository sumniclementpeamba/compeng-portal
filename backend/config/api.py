from django.http import JsonResponse
from django.urls import include, path

from accounts.views import (
    LoginView,
    MemberAvatarView,
    MemberCSVUploadView,
    MemberListView,
    MemberRoleUpdateView,
    MeAvatarView,
    MeView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationUnreadCountView,
    RegisterView,
    ResetAllPasswordsView,
    notification_stream,
)
from audit.views import AuditLogListView


def health(request):
    return JsonResponse({"ok": True})


urlpatterns = [
    # Health check — Render / Railway use this
    path("health/", health, name="health"),

    # Auth
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/register/", RegisterView.as_view(), name="register"),

    # Me
    path("me/", MeView.as_view(), name="me"),
    path("me/avatar/", MeAvatarView.as_view(), name="me-avatar"),

    # Notifications
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("notifications/unread-count/", NotificationUnreadCountView.as_view(), name="notifications-unread-count"),
    path("notifications/read-all/", NotificationMarkAllReadView.as_view(), name="notifications-read-all"),
    path("notifications/<int:pk>/read/", NotificationMarkReadView.as_view(), name="notifications-read"),
    path("notifications/stream/", notification_stream, name="notifications-stream"),

    # Resources
    path("resources/", include("resources.urls")),

    # Announcements
    path("announcements/", include("announcements.urls")),

    # Audit
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),

    # Members
    path("members/", MemberListView.as_view(), name="members"),
    path("members/import-csv/", MemberCSVUploadView.as_view(), name="members-import-csv"),
    path("members/reset-passwords/", ResetAllPasswordsView.as_view(), name="members-reset-passwords"),
    path("members/<int:user_id>/avatar/", MemberAvatarView.as_view(), name="member-avatar"),
    path("members/<int:user_id>/role/", MemberRoleUpdateView.as_view(), name="member-role"),
    path("attendance/", include("attendance.urls")),
] 