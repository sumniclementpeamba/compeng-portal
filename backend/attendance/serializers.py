from rest_framework import serializers

from .models import AttendanceRecord, AttendanceSession, TimetableEntry


# ─────────────────────────────────────────────────────────────
# Timetable
# ─────────────────────────────────────────────────────────────
class TimetableEntrySerializer(serializers.ModelSerializer):
    day_label = serializers.SerializerMethodField()
    course_display = serializers.SerializerMethodField()

    class Meta:
        model = TimetableEntry
        fields = (
            "id", "course_code", "course_title",
            "day_of_week", "day_label",
            "start_time", "end_time",
            "room", "lecturer", "course_display",
            "check_in_starts_minutes_before",
            "check_in_ends_minutes_after",
            "late_after_minutes",
            # GPS config
            "latitude", "longitude",
            "geofence_radius_meters", "require_location",
            "active", "created_at",
        )
        read_only_fields = ("id", "created_at", "day_label", "course_display")

    def get_day_label(self, obj):
        return obj.get_day_of_week_display()

    def get_course_display(self, obj):
        return obj.course_title or obj.course_code

    def validate(self, data):
        if data.get("start_time") and data.get("end_time"):
            if data["start_time"] >= data["end_time"]:
                raise serializers.ValidationError(
                    "End time must be after start time."
                )
        return data


# ─────────────────────────────────────────────────────────────
# Records
# ─────────────────────────────────────────────────────────────
class AttendanceRecordSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_name = serializers.SerializerMethodField()
    reference_number = serializers.CharField(
        source="user.reference_number", read_only=True
    )
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = AttendanceRecord
        fields = (
            "id", "user_id", "user_name", "reference_number",
            "avatar_url", "status", "note",
            "check_in_method", "marked_at",
            # GPS + verification data
            "check_in_gps_lat", "check_in_gps_lng", "check_in_gps_accuracy",
            "check_in_ip", "check_in_flags", "needs_review",
        )
        read_only_fields = (
            "id", "user_id", "user_name", "reference_number",
            "avatar_url", "check_in_method", "marked_at",
            "check_in_gps_lat", "check_in_gps_lng", "check_in_gps_accuracy",
            "check_in_ip", "check_in_flags", "needs_review",
        )

    def get_user_name(self, obj):
        return obj.user.first_name or obj.user.username

    def get_avatar_url(self, obj):
        if not obj.user.avatar:
            return None
        return f"/api/members/{obj.user.pk}/avatar/"


# ─────────────────────────────────────────────────────────────
# Sessions
# ─────────────────────────────────────────────────────────────
class AttendanceSessionSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    timetable_course = serializers.SerializerMethodField()
    record_count = serializers.SerializerMethodField()
    present_count = serializers.SerializerMethodField()
    absent_count = serializers.SerializerMethodField()
    late_count = serializers.SerializerMethodField()
    self_check_in_count = serializers.SerializerMethodField()
    needs_review_count = serializers.SerializerMethodField()
    check_in_open = serializers.ReadOnlyField()

    class Meta:
        model = AttendanceSession
        fields = (
            "id", "title", "date", "course_name", "notes",
            "timetable_entry", "timetable_course",
            "self_check_in",
            "check_in_opens_at", "check_in_closes_at",
            "late_after_at", "late_after_minutes",
            "check_in_window_minutes", "cancelled",
            "check_in_open",
            # GPS snapshot
            "classroom_lat", "classroom_lng",
            "geofence_radius_meters", "require_location",
            # Meta
            "created_by", "created_by_name", "created_at",
            "record_count", "present_count", "absent_count",
            "late_count", "self_check_in_count", "needs_review_count",
        )
        read_only_fields = (
            "id", "created_by", "created_by_name", "created_at",
            "timetable_entry", "timetable_course",
            "check_in_opens_at", "check_in_closes_at", "late_after_at",
            "check_in_open",
            "classroom_lat", "classroom_lng",
            "geofence_radius_meters", "require_location",
            "record_count", "present_count", "absent_count",
            "late_count", "self_check_in_count", "needs_review_count",
        )

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.first_name or obj.created_by.username

    def get_timetable_course(self, obj):
        if not obj.timetable_entry:
            return None
        return obj.timetable_entry.course_code

    def get_record_count(self, obj):
        return obj.records.count()

    def get_present_count(self, obj):
        return obj.records.filter(status="present").count()

    def get_absent_count(self, obj):
        return obj.records.filter(status="absent").count()

    def get_late_count(self, obj):
        return obj.records.filter(status="late").count()

    def get_self_check_in_count(self, obj):
        return obj.records.filter(check_in_method="self").count()

    def get_needs_review_count(self, obj):
        """Number of check-ins on this session waiting for rep review."""
        return obj.records.filter(needs_review=True).count()


class AttendanceSessionDetailSerializer(AttendanceSessionSerializer):
    records = AttendanceRecordSerializer(many=True, read_only=True)

    class Meta(AttendanceSessionSerializer.Meta):
        fields = AttendanceSessionSerializer.Meta.fields + ("records",) 