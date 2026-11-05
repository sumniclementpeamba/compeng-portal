from django.http import JsonResponse
from django.urls import include, path

from accounts.views import (
    LoginView,
    MemberAvatarView,
    MemberCSVUploadView,
    MemberListView,
    MemberRoleUpdateView,
    MemberExportView,
    MemberSummaryView,
    MeAvatarView,
    MeView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationUnreadCountView,
    RegisterView,
    ResetAllPasswordsView,
    notification_stream,
    face_status,
    face_enroll,
    face_delete,
)
from audit.views import AuditLogListView


def health(request):
    return JsonResponse({"ok": True})


urlpatterns = [
    path("health/", health, name="health"),

    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/register/", RegisterView.as_view(), name="register"),

    path("me/", MeView.as_view(), name="me"),
    path("me/avatar/", MeAvatarView.as_view(), name="me-avatar"),

    # ── Face verification ──
    path("me/face/status/", face_status, name="face-status"),
    path("me/face/enroll/", face_enroll, name="face-enroll"),
    path("me/face/",        face_delete, name="face-delete"),

    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("notifications/unread-count/", NotificationUnreadCountView.as_view(), name="notifications-unread-count"),
    path("notifications/read-all/", NotificationMarkAllReadView.as_view(), name="notifications-read-all"),
    path("notifications/<int:pk>/read/", NotificationMarkReadView.as_view(), name="notifications-read"),
    path("notifications/stream/", notification_stream, name="notifications-stream"),

    path("resources/", include("resources.urls")),
    path("announcements/", include("announcements.urls")),
    path("audit-logs/", AuditLogListView.as_view(), name="audit-logs"),

    path("members/", MemberListView.as_view(), name="members"),
    path("members/import-csv/", MemberCSVUploadView.as_view(), name="members-import-csv"),
    path("members/reset-passwords/", ResetAllPasswordsView.as_view(), name="members-reset-passwords"),
    path("members/export/", MemberExportView.as_view(), name="members-export"),
    path("members/summary/", MemberSummaryView.as_view(), name="members-summary"),
    path("members/<int:user_id>/avatar/", MemberAvatarView.as_view(), name="member-avatar"),
    path("members/<int:user_id>/role/", MemberRoleUpdateView.as_view(), name="member-role"),

    path("attendance/", include("attendance.urls")),
] 