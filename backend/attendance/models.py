from django.conf import settings
from django.db import models
from django.utils import timezone


# ─────────────────────────────────────────────────────────────
# Timetable — the weekly schedule that drives auto check-in
# ─────────────────────────────────────────────────────────────
class TimetableEntry(models.Model):
    """One weekly slot: "CSC301 on Tuesdays from 10:00 to 12:00"."""

    DAY_CHOICES = [
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    ]

    course_code = models.CharField(max_length=20)
    course_title = models.CharField(max_length=200, blank=True)
    day_of_week = models.IntegerField(choices=DAY_CHOICES)
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=50, blank=True)
    lecturer = models.CharField(max_length=100, blank=True)

    # How the check-in window is calculated from the class time.
    # Opens N minutes before start, closes M minutes after end.
    check_in_starts_minutes_before = models.PositiveIntegerField(default=5)
    check_in_ends_minutes_after = models.PositiveIntegerField(default=15)
    late_after_minutes = models.PositiveIntegerField(default=10)

    # ── Classroom location for GPS verification ─────────────
    # When require_location is True, students must check in from
    # within geofence_radius_meters of (latitude, longitude).
    # When both coordinates are None, GPS is effectively disabled
    # for this course even if require_location is True — the
    # session just won't get a geofence and check-ins will succeed
    # without a location check.
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    geofence_radius_meters = models.PositiveIntegerField(default=150)
    require_location = models.BooleanField(default=True)

    active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["day_of_week", "start_time"]
        indexes = [
            models.Index(fields=["day_of_week", "active"]),
        ]

    def __str__(self):
        return (
            f"{self.get_day_of_week_display()} "
            f"{self.start_time}-{self.end_time} · {self.course_code}"
        )


# ─────────────────────────────────────────────────────────────
# Attendance session — one meeting, manual or timetable-derived
# ─────────────────────────────────────────────────────────────
class AttendanceSession(models.Model):
    title = models.CharField(max_length=200)
    date = models.DateField()
    course_name = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    # If set, this session was auto-generated from the timetable.
    # Null for manually-created ad-hoc sessions.
    timetable_entry = models.ForeignKey(
        TimetableEntry,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="sessions",
    )

    self_check_in = models.BooleanField(default=False)

    check_in_opens_at = models.DateTimeField(null=True, blank=True)
    check_in_closes_at = models.DateTimeField(null=True, blank=True)

    # If set, anyone checking in after this moment is marked LATE.
    # For timetable sessions, this is (class_start + late_after_minutes).
    # For manual sessions, the check-in view falls back to
    # (check_in_opens_at + late_after_minutes).
    late_after_at = models.DateTimeField(null=True, blank=True)
    late_after_minutes = models.PositiveIntegerField(default=5)

    check_in_window_minutes = models.PositiveIntegerField(default=15)

    # ── Snapshot of classroom location at session-creation time ──
    # Copied from timetable_entry so that later edits to the timetable
    # don't change where past sessions "were". A session created before
    # GPS support will have these as None — no geofence, check-ins
    # succeed without a location check.
    classroom_lat = models.FloatField(null=True, blank=True)
    classroom_lng = models.FloatField(null=True, blank=True)
    geofence_radius_meters = models.PositiveIntegerField(default=150)
    require_location = models.BooleanField(default=True)

    # Set to True by the rep if class was cancelled.
    cancelled = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["timetable_entry", "date"],
                condition=models.Q(timetable_entry__isnull=False),
                name="unique_timetable_session_per_day",
            ),
        ]

    def __str__(self):
        return f"{self.date} — {self.title}"

    @property
    def check_in_open(self):
        if self.cancelled:
            return False
        now = timezone.now()
        return bool(
            self.check_in_opens_at
            and self.check_in_closes_at
            and self.check_in_opens_at <= now < self.check_in_closes_at
        )


# ─────────────────────────────────────────────────────────────
# Attendance record — one row per student per session
# ─────────────────────────────────────────────────────────────
class AttendanceRecord(models.Model):
    STATUS_PRESENT = "present"
    STATUS_ABSENT = "absent"
    STATUS_LATE = "late"
    STATUS_EXCUSED = "excused"

    STATUS_CHOICES = [
        (STATUS_PRESENT, "Present"),
        (STATUS_ABSENT, "Absent"),
        (STATUS_LATE, "Late"),
        (STATUS_EXCUSED, "Excused"),
    ]

    METHOD_REP = "rep"
    METHOD_SELF = "self"
    METHOD_AUTO = "auto"

    METHOD_CHOICES = [
        (METHOD_REP, "Marked by rep"),
        (METHOD_SELF, "Self check-in"),
        (METHOD_AUTO, "Automatic"),
    ]

    session = models.ForeignKey(
        AttendanceSession, on_delete=models.CASCADE, related_name="records",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name="attendance_records",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_ABSENT,
    )
    note = models.CharField(max_length=200, blank=True)

    check_in_method = models.CharField(
        max_length=10, choices=METHOD_CHOICES, default=METHOD_AUTO,
    )

    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="+",
    )
    marked_at = models.DateTimeField(auto_now=True)

    # ── GPS + verification data captured at check-in time ────
    # These are None for records created by the system (auto) or by
    # the rep marking attendance manually. They're only populated when
    # a student uses self check-in, so the rep can later audit "where
    # was this student when they checked in?"
    check_in_gps_lat = models.FloatField(null=True, blank=True)
    check_in_gps_lng = models.FloatField(null=True, blank=True)
    check_in_gps_accuracy = models.FloatField(null=True, blank=True)
    check_in_ip = models.GenericIPAddressField(null=True, blank=True)

    # Flags set by the geofence / IP / device checks at check-in time.
    # Possible values:
    #   "no_gps"             — student's browser gave no coordinates
    #   "low_accuracy"       — GPS accuracy > 300m, reading untrustworthy
    #   "uncertain_geofence" — GPS said student is within ±accuracy of the boundary
    #   "off_campus_network" — IP not in CAMPUS_NETWORKS (soft flag only)
    check_in_flags = models.JSONField(default=list, blank=True)

    # True if the record has any flags — this is what drives the
    # "needs review" red badge in the rep's session editor.
    needs_review = models.BooleanField(default=False)

    class Meta:
        unique_together = ("session", "user")
        ordering = ["user__first_name", "user__username"]

    def __str__(self):
        return f"{self.user.username} · {self.session.title} · {self.status}"


# ─────────────────────────────────────────────────────────────
# Device record — one fingerprint per session
# ─────────────────────────────────────────────────────────────
class DeviceRecord(models.Model):
    """One row per (device fingerprint, session) pair.

    The unique constraint below is the real enforcement: even under
    concurrent check-ins, the DB will refuse a second student using
    the same fingerprint for the same session. This is what blocks
    "one person checking in five friends on their phone."

    Fingerprints are computed client-side from public browser
    characteristics (screen size, canvas hash, timezone, etc.) — no
    sensor or permission is required on the device.
    """

    fingerprint = models.CharField(max_length=64, db_index=True)
    session = models.ForeignKey(
        AttendanceSession, on_delete=models.CASCADE,
        related_name="device_records",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("fingerprint", "session")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.fingerprint[:8]} → {self.user.username}" 