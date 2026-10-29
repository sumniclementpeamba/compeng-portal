from django.contrib import admin

from .models import DownloadRecord, Resource, ResourceVersion


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = (
        "title", "course_name", "resource_type", "status",
        "version", "uploaded_by", "created_at",
    )
    list_filter = ("status", "resource_type", "semester")
    search_fields = ("title", "description", "course_name", "tags")
    readonly_fields = (
        "checksum", "size", "version", "created_at", "updated_at",
        "reviewed_by", "reviewed_at",
    )


@admin.register(ResourceVersion)
class ResourceVersionAdmin(admin.ModelAdmin):
    list_display = ("resource", "version_number", "is_current", "uploaded_by", "created_at")
    list_filter = ("is_current",)


@admin.register(DownloadRecord)
class DownloadRecordAdmin(admin.ModelAdmin):
    list_display = ("resource", "user", "created_at")
    list_filter = ("created_at",)
    readonly_fields = ("resource", "user", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False 