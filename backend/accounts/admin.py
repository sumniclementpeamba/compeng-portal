from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import ClassMembership, Notification, User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Class info", {"fields": ("matric_no", "level", "avatar")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Class info", {"fields": ("matric_no", "level")}),
    )
    list_display = ("username", "email", "first_name", "level", "is_staff")
    list_filter = UserAdmin.list_filter + ("level",)


@admin.register(ClassMembership)
class ClassMembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "joined_at")
    list_filter = ("role",)
    search_fields = ("user__username", "user__first_name")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "title", "is_read", "created_at")
    list_filter = ("kind", "is_read")
    search_fields = ("user__username", "title")
    readonly_fields = ("user", "actor", "kind", "title", "body", "link", "created_at") 