from django.contrib import admin

from .models import Announcement


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("title", "course_name", "pinned", "author", "created_at", "expires_at")
    list_filter = ("pinned", "course_name")
    search_fields = ("title", "body", "course_name") 