from rest_framework.permissions import BasePermission


def role_of(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return "admin"
    membership = getattr(user, "membership", None)
    return membership.role if membership else "student"


class CanReview(BasePermission):
    """Course rep or admin only."""
    def has_permission(self, request, view):
        return role_of(request.user) in ("rep", "admin")


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return role_of(request.user) == "admin"