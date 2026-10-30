from django.contrib import admin

from .models import AttendanceRecord, AttendanceSession, TimetableEntry


@admin.register(TimetableEntry)
class TimetableEntryAdmin(admin.ModelAdmin):
    list_display = (
        "course_code", "day_of_week", "start_time", "end_time",
        "room", "active", "created_by",
    )
    list_filter = ("day_of_week", "active", "course_code")
    search_fields = ("course_code", "course_title", "lecturer", "room")
    ordering = ("day_of_week", "start_time")


class AttendanceRecordInline(admin.TabularInline):
    model = AttendanceRecord
    extra = 0
    readonly_fields = ("marked_at",)


@admin.register(AttendanceSession)
class AttendanceSessionAdmin(admin.ModelAdmin):
    list_display = (
        "date", "title", "course_name", "self_check_in",
        "cancelled", "timetable_entry", "created_at",
    )
    list_filter = ("self_check_in", "cancelled", "date")
    search_fields = ("title", "notes", "course_name")
    inlines = [AttendanceRecordInline]


@admin.register(AttendanceRecord)
class AttendanceRecordAdmin(admin.ModelAdmin):
    list_display = ("session", "user", "status", "check_in_method", "marked_at")
    list_filter = ("status", "check_in_method")
    search_fields = ("user__username", "user__first_name", "session__title") 