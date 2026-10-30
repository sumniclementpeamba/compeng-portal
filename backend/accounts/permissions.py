from rest_framework.permissions import BasePermission


def role_of(user):
    """Effective role — superuser overrides membership."""
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "admin"
    m = getattr(user, "membership", None)
    return m.role if m else "student"


def is_class_rep(user):
    """True if the user's ClassMembership.role is 'rep'.
    Superuser status is irrelevant here — only membership matters."""
    if not user or not user.is_authenticated:
        return False
    m = getattr(user, "membership", None)
    return bool(m and m.role == "rep")


class CanReview(BasePermission):
    """Course rep or admin — for content moderation."""
    def has_permission(self, request, view):
        return role_of(request.user) in ("rep", "admin")


class IsAdminRole(BasePermission):
    """Admin only — for system operations."""
    def has_permission(self, request, view):
        return role_of(request.user) == "admin"


class IsClassRep(BasePermission):
    """Only users whose ClassMembership.role == 'rep'.

    Admins without a rep membership are DENIED. Use this for actions
    that belong to the class rep specifically (attendance marking,
    timetable management) — the admin role does not grant them.
    """
    def has_permission(self, request, view):
        return is_class_rep(request.user) 