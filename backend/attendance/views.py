import csv
from datetime import datetime, timedelta

from django.db import IntegrityError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import CanReview, IsAdminRole, IsClassRep, role_of
from audit.models import log
from .models import AttendanceRecord, AttendanceSession, TimetableEntry
from .serializers import (
    AttendanceRecordSerializer,
    AttendanceSessionDetailSerializer,
    AttendanceSessionSerializer,
    TimetableEntrySerializer,
)
from .semester import (
    build_semester_meta,
    counted_semester_dates,
    expected_sessions_by_course,
    expected_sessions_total,
    get_semester_config,
    semester_progress,
)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _is_frozen(session):
    """A session 'freezes' once its check-in window closes.

    Only used to prevent reopening a closed manual session. Attendance
    marking is admin-only regardless of freeze state.
    """
    if not session.check_in_closes_at:
        return False
    return timezone.now() >= session.check_in_closes_at


def _eligible_users():
    """Every user with a ClassMembership row.

    Students and reps get attendance records. Admins with a membership
    also get records (so they can self check-in). Admin-only accounts
    created via createsuperuser without a membership are excluded.
    """
    return User.objects.filter(membership__isnull=False)


# ─────────────────────────────────────────────────────────────
# Auto-session generation from timetable
# ─────────────────────────────────────────────────────────────
def ensure_todays_sessions_for_user(user):
    """Lazily create any timetable sessions whose check-in window is
    currently open, and ensure the requesting user has a record.

    Called on every attendance page load. Idempotent.
    """
    now = timezone.now()
    today = now.date()
    day_of_week = today.weekday()
    tz = timezone.get_current_timezone()

    entries = TimetableEntry.objects.filter(active=True, day_of_week=day_of_week)

    active_ids = []
    for entry in entries:
        class_start = timezone.make_aware(
            datetime.combine(today, entry.start_time), tz,
        )
        class_end = timezone.make_aware(
            datetime.combine(today, entry.end_time), tz,
        )
        opens_at = class_start - timedelta(
            minutes=entry.check_in_starts_minutes_before
        )
        closes_at = class_end + timedelta(
            minutes=entry.check_in_ends_minutes_after
        )

        if not (opens_at <= now < closes_at):
            continue

        session, created = AttendanceSession.objects.get_or_create(
            timetable_entry=entry,
            date=today,
            defaults={
                "title": f"{entry.course_code} — {entry.course_title or 'Lecture'}",
                "course_name": entry.course_code,
                "self_check_in": True,
                "check_in_opens_at": opens_at,
                "check_in_closes_at": closes_at,
                "late_after_at": class_start + timedelta(
                    minutes=entry.late_after_minutes
                ),
                "late_after_minutes": entry.late_after_minutes,
                "created_by": entry.created_by,
            },
        )

        if created:
            members = _eligible_users().values_list("id", flat=True)
            AttendanceRecord.objects.bulk_create([
                AttendanceRecord(
                    session=session,
                    user_id=uid,
                    status=AttendanceRecord.STATUS_ABSENT,
                    check_in_method=AttendanceRecord.METHOD_AUTO,
                )
                for uid in members
            ], ignore_conflicts=True)
            log(
                entry.created_by, "attendance.auto_session_created", session,
                title=session.title, date=str(session.date),
                timetable_id=entry.id,
            )

        active_ids.append(session.id)

    return active_ids


def _compute_late_threshold(session):
    if session.late_after_at:
        return session.late_after_at
    if session.check_in_opens_at:
        return session.check_in_opens_at + timedelta(
            minutes=session.late_after_minutes
        )
    return None


# ─────────────────────────────────────────────────────────────
# Timetable CRUD — reps create/edit, admins read-only
# ─────────────────────────────────────────────────────────────
class TimetableEntryListCreateView(generics.ListCreateAPIView):
    serializer_class = TimetableEntrySerializer

    def get_queryset(self):
        qs = TimetableEntry.objects.all()
        if role_of(self.request.user) != "admin":
            active_only = self.request.query_params.get("active", "1")
            if active_only == "1":
                qs = qs.filter(active=True)
        return qs.order_by("day_of_week", "start_time")

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsClassRep()]
        return super().get_permissions()

    def perform_create(self, serializer):
        entry = serializer.save(created_by=self.request.user)
        log(
            self.request.user, "timetable.entry_created", entry,
            title=f"{entry.course_code} {entry.get_day_of_week_display()} {entry.start_time}",
        )


class TimetableEntryDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = TimetableEntry.objects.all()
    serializer_class = TimetableEntrySerializer

    def get_permissions(self):
        if self.request.method in ("PUT", "PATCH", "DELETE"):
            return [IsClassRep()]
        return [CanReview()]

    def perform_update(self, serializer):
        entry = serializer.save()
        log(
            self.request.user, "timetable.entry_updated", entry,
            title=f"{entry.course_code} {entry.get_day_of_week_display()} {entry.start_time}",
        )

    def perform_destroy(self, instance):
        log(
            self.request.user, "timetable.entry_deleted", instance,
            title=f"{instance.course_code} {instance.get_day_of_week_display()} {instance.start_time}",
        )
        instance.delete()


# ─────────────────────────────────────────────────────────────
# Sessions — list/create
# ─────────────────────────────────────────────────────────────
class AttendanceSessionListCreateView(generics.ListCreateAPIView):
    serializer_class = AttendanceSessionSerializer

    def get_queryset(self):
        qs = AttendanceSession.objects.select_related("created_by")
        if role_of(self.request.user) == "student":
            qs = qs.filter(records__user=self.request.user).distinct()
        return qs

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsClassRep()]
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        ensure_todays_sessions_for_user(request.user)
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session = serializer.save(created_by=request.user)

        # Auto-open check-in for manual sessions. Reps can't mark attendance
        # themselves, so the session must be immediately usable by students
        # (including the rep) for self check-in.
        if session.self_check_in and not session.timetable_entry:
            now = timezone.now()
            session.check_in_opens_at = now
            session.check_in_closes_at = now + timedelta(
                minutes=session.check_in_window_minutes
            )
            session.late_after_at = now + timedelta(
                minutes=session.late_after_minutes
            )
            session.save(update_fields=[
                "check_in_opens_at", "check_in_closes_at", "late_after_at",
            ])

        default_status = (
            AttendanceRecord.STATUS_ABSENT
            if session.self_check_in
            else AttendanceRecord.STATUS_PRESENT
        )
        default_method = (
            AttendanceRecord.METHOD_AUTO
            if session.self_check_in
            else AttendanceRecord.METHOD_REP
        )

        members = _eligible_users()
        AttendanceRecord.objects.bulk_create([
            AttendanceRecord(
                session=session,
                user=member,
                status=default_status,
                check_in_method=default_method,
                marked_by=None if session.self_check_in else request.user,
            )
            for member in members
        ])

        log(
            request.user, "attendance.session_created", session,
            title=session.title, date=str(session.date),
            self_check_in=session.self_check_in,
        )

        return Response(
            AttendanceSessionDetailSerializer(session).data,
            status=status.HTTP_201_CREATED,
        )


class AttendanceSessionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Readable by rep + admin. Editable by rep + admin.

    Metadata changes and cancellations don't affect attendance records
    directly, so no freeze gate applies here. Marking records is
    admin-only via AttendanceMarkView.
    """

    serializer_class = AttendanceSessionDetailSerializer
    permission_classes = [CanReview]

    def get_queryset(self):
        return (
            AttendanceSession.objects
            .select_related("created_by")
            .prefetch_related("records__user")
        )


# ─────────────────────────────────────────────────────────────
# Cancel session — rep only
# ─────────────────────────────────────────────────────────────
class AttendanceCancelSessionView(APIView):
    permission_classes = [IsClassRep]

    def post(self, request, pk):
        session = get_object_or_404(AttendanceSession, pk=pk)
        if session.cancelled:
            return Response(
                {"detail": "Session is already cancelled."}, status=400,
            )
        session.cancelled = True
        session.save(update_fields=["cancelled"])
        log(
            request.user, "attendance.session_cancelled", session,
            title=session.title, date=str(session.date),
        )
        return Response(AttendanceSessionDetailSerializer(session).data)


# ─────────────────────────────────────────────────────────────
# Open / close check-in — rep only
# ─────────────────────────────────────────────────────────────
class AttendanceOpenCheckInView(APIView):
    permission_classes = [IsClassRep]

    def post(self, request, pk):
        session = get_object_or_404(AttendanceSession, pk=pk)

        if session.timetable_entry:
            return Response(
                {"detail": "Timetable sessions open automatically."},
                status=400,
            )
        if not session.self_check_in:
            return Response(
                {"detail": "This session is not configured for self check-in."},
                status=400,
            )
        if session.check_in_open:
            return Response(
                {"detail": "Check-in window is already open."},
                status=400,
            )
        if _is_frozen(session):
            return Response(
                {"detail": "This session has already closed and is locked."},
                status=403,
            )

        now = timezone.now()
        session.check_in_opens_at = now
        session.check_in_closes_at = now + timedelta(
            minutes=session.check_in_window_minutes
        )
        session.late_after_at = now + timedelta(
            minutes=session.late_after_minutes
        )
        session.save(update_fields=[
            "check_in_opens_at", "check_in_closes_at", "late_after_at",
        ])

        log(
            request.user, "attendance.check_in_opened", session,
            title=session.title,
            closes_at=session.check_in_closes_at.isoformat(),
        )
        return Response(AttendanceSessionDetailSerializer(session).data)


class AttendanceCloseCheckInView(APIView):
    permission_classes = [IsClassRep]

    def post(self, request, pk):
        session = get_object_or_404(AttendanceSession, pk=pk)
        if not session.check_in_opens_at:
            return Response(
                {"detail": "Check-in window was never opened."}, status=400,
            )
        session.check_in_closes_at = timezone.now()
        session.save(update_fields=["check_in_closes_at"])
        log(
            request.user, "attendance.check_in_closed", session,
            title=session.title,
        )
        return Response(AttendanceSessionDetailSerializer(session).data)


# ─────────────────────────────────────────────────────────────
# Self check-in — students AND reps (anyone with a record)
# ─────────────────────────────────────────────────────────────
class AttendanceSelfCheckInView(APIView):
    def post(self, request, pk):
        session = get_object_or_404(AttendanceSession, pk=pk)

        if session.cancelled:
            return Response(
                {"detail": "This session was cancelled by the course rep."},
                status=400,
            )
        if not session.self_check_in:
            return Response(
                {"detail": "This session does not accept self check-in."},
                status=400,
            )

        now = timezone.now()
        if not session.check_in_open:
            if not session.check_in_opens_at:
                return Response(
                    {"detail": "Check-in has not been opened yet."}, status=400,
                )
            if now >= session.check_in_closes_at:
                return Response(
                    {"detail": "The check-in window has closed."}, status=400,
                )
            return Response(
                {"detail": "Check-in is not open right now."}, status=400,
            )

        record, _ = AttendanceRecord.objects.get_or_create(
            session=session,
            user=request.user,
            defaults={
                "status": AttendanceRecord.STATUS_ABSENT,
                "check_in_method": AttendanceRecord.METHOD_AUTO,
            },
        )

        if record.status != AttendanceRecord.STATUS_ABSENT:
            return Response(
                {"detail": f"Your record is already marked '{record.status}'. "
                           "Contact the admin if this is wrong."},
                status=400,
            )
        if record.marked_by_id and record.marked_by_id != request.user.pk:
            return Response(
                {"detail": "Your record was already marked by an admin."},
                status=400,
            )

        late_threshold = _compute_late_threshold(session)
        new_status = (
            AttendanceRecord.STATUS_LATE
            if late_threshold and now >= late_threshold
            else AttendanceRecord.STATUS_PRESENT
        )

        record.status = new_status
        record.check_in_method = AttendanceRecord.METHOD_SELF
        record.marked_by = request.user
        try:
            record.save(update_fields=[
                "status", "check_in_method", "marked_by", "marked_at",
            ])
        except IntegrityError:
            return Response(
                {"detail": "You have already checked in for this session."},
                status=400,
            )

        log(
            request.user, "attendance.self_check_in", session,
            title=session.title, status=new_status,
        )

        return Response({
            "ok": True,
            "status": new_status,
            "record": AttendanceRecordSerializer(record).data,
        })


# ─────────────────────────────────────────────────────────────
# Single student record for a session
# ─────────────────────────────────────────────────────────────
class AttendanceSessionStudentView(APIView):
    def get(self, request, pk):
        session = get_object_or_404(AttendanceSession, pk=pk)
        record = session.records.filter(user=request.user).first()
        if not record:
            return Response(
                {"detail": "You have no record for this session."}, status=404,
            )
        return Response({
            "session": AttendanceSessionSerializer(session).data,
            "record": AttendanceRecordSerializer(record).data,
        })


# ─────────────────────────────────────────────────────────────
# Bulk mark — admin only, at any time
# ─────────────────────────────────────────────────────────────
class AttendanceMarkView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, pk):
        session = get_object_or_404(AttendanceSession, pk=pk)

        records_data = request.data.get("records", [])
        if not isinstance(records_data, list):
            return Response({"detail": "records must be a list."}, status=400)

        valid_statuses = {s for s, _ in AttendanceRecord.STATUS_CHOICES}
        updated = 0
        errors = []

        for item in records_data:
            user_id = item.get("user_id")
            new_status = item.get("status")
            note = (item.get("note") or "").strip()

            if not user_id or new_status not in valid_statuses:
                errors.append(f"Invalid item: {item}")
                continue

            record = session.records.filter(user_id=user_id).first()
            if not record:
                errors.append(f"No record for user {user_id}")
                continue

            if record.status != new_status or record.note != note:
                record.status = new_status
                record.note = note
                record.check_in_method = AttendanceRecord.METHOD_REP
                record.marked_by = request.user
                record.save()
                updated += 1

        log(
            request.user, "attendance.marked", session,
            title=session.title, updated=updated, errors=len(errors),
        )

        return Response({
            "updated": updated,
            "errors": errors,
            "session": AttendanceSessionDetailSerializer(session).data,
        })


# ─────────────────────────────────────────────────────────────
# Student's personal history + live check-ins
# ─────────────────────────────────────────────────────────────
class MyAttendanceView(APIView):
    def get(self, request):
        ensure_todays_sessions_for_user(request.user)

        records = (
            AttendanceRecord.objects
            .filter(user=request.user)
            .select_related("session")
            .order_by("-session__date", "-session__created_at")
        )

        total = records.count()
        present = records.filter(status="present").count()
        absent = records.filter(status="absent").count()
        late = records.filter(status="late").count()
        excused = records.filter(status="excused").count()

        attended = present + late
        percentage = round((attended / total * 100), 1) if total > 0 else 0

        now = timezone.now()
        active_sessions = (
            AttendanceSession.objects
            .filter(
                cancelled=False,
                self_check_in=True,
                check_in_opens_at__lte=now,
                check_in_closes_at__gt=now,
                records__user=request.user,
                records__status=AttendanceRecord.STATUS_ABSENT,
            )
            .distinct()
            .order_by("check_in_closes_at")
        )

        record_data = []
        for r in records:
            item = AttendanceRecordSerializer(r).data
            item["session_id"] = r.session_id
            item["session_title"] = r.session.title
            item["session_date"] = str(r.session.date)
            item["session_course"] = r.session.course_name
            item["session_cancelled"] = r.session.cancelled
            record_data.append(item)

        return Response({
            "summary": {
                "total": total,
                "present": present,
                "absent": absent,
                "late": late,
                "excused": excused,
                "attended": attended,
                "percentage": percentage,
            },
            "active_check_ins": AttendanceSessionSerializer(
                active_sessions, many=True
            ).data,
            "records": record_data,
        })


# ─────────────────────────────────────────────────────────────
# Semester summary — student's own
# ─────────────────────────────────────────────────────────────
class MySemesterAttendanceView(APIView):
    def get(self, request):
        config = get_semester_config()
        if not config:
            return Response(
                {"detail": "Semester not configured on the server."},
                status=500,
            )

        counted = counted_semester_dates(config)
        if not counted:
            return Response({
                "semester": {
                    **build_semester_meta(config),
                    "progress": semester_progress(config),
                },
                "summary": {
                    "expected_total": 0,
                    "expected_to_date": 0,
                    "recorded": 0,
                    "present": 0, "late": 0, "absent": 0, "excused": 0,
                    "attended": 0,
                    "percentage_vs_expected": 0,
                    "percentage_vs_recorded": 0,
                },
                "by_course": [],
            })

        counted_set = set(counted)
        date_min, date_max = counted[0], counted[-1]

        all_records = list(
            AttendanceRecord.objects
            .filter(
                user=request.user,
                session__date__gte=date_min,
                session__date__lte=date_max,
                session__cancelled=False,
            )
            .select_related("session")
        )
        records = [r for r in all_records if r.session.date in counted_set]

        present = sum(1 for r in records if r.status == AttendanceRecord.STATUS_PRESENT)
        late = sum(1 for r in records if r.status == AttendanceRecord.STATUS_LATE)
        absent = sum(1 for r in records if r.status == AttendanceRecord.STATUS_ABSENT)
        excused = sum(1 for r in records if r.status == AttendanceRecord.STATUS_EXCUSED)
        attended = present + late
        recorded = len(records)

        expected_total = expected_sessions_total(config)
        expected_to_date = expected_sessions_total(config, upto_today=True)

        by_course = {}
        for r in records:
            code = r.session.course_name or "General"
            by_course.setdefault(code, {
                "course_code": code,
                "present": 0, "late": 0, "absent": 0, "excused": 0,
                "recorded": 0, "attended": 0,
            })
            c = by_course[code]
            c["recorded"] += 1
            if r.status == AttendanceRecord.STATUS_PRESENT:
                c["present"] += 1
                c["attended"] += 1
            elif r.status == AttendanceRecord.STATUS_LATE:
                c["late"] += 1
                c["attended"] += 1
            elif r.status == AttendanceRecord.STATUS_ABSENT:
                c["absent"] += 1
            elif r.status == AttendanceRecord.STATUS_EXCUSED:
                c["excused"] += 1

        expected_by_course = expected_sessions_by_course(config)
        for code, c in by_course.items():
            c["expected"] = expected_by_course.get(code, 0)
            c["percentage_vs_expected"] = (
                round(c["attended"] / c["expected"] * 100, 1)
                if c["expected"] else 0
            )
            c["percentage_vs_recorded"] = (
                round(c["attended"] / c["recorded"] * 100, 1)
                if c["recorded"] else 0
            )

        return Response({
            "semester": {
                **build_semester_meta(config),
                "progress": semester_progress(config),
            },
            "summary": {
                "expected_total": expected_total,
                "expected_to_date": expected_to_date,
                "recorded": recorded,
                "present": present,
                "late": late,
                "absent": absent,
                "excused": excused,
                "attended": attended,
                "percentage_vs_expected": (
                    round(attended / expected_to_date * 100, 1)
                    if expected_to_date else 0
                ),
                "percentage_vs_recorded": (
                    round(attended / recorded * 100, 1)
                    if recorded else 0
                ),
            },
            "by_course": sorted(by_course.values(), key=lambda x: x["course_code"]),
        })


# ─────────────────────────────────────────────────────────────
# Semester summary — admin sees every student
# ─────────────────────────────────────────────────────────────
class SemesterAttendanceSummaryView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        config = get_semester_config()
        if not config:
            return Response(
                {"detail": "Semester not configured on the server."},
                status=500,
            )

        counted = counted_semester_dates(config)
        counted_set = set(counted)
        expected_total = expected_sessions_total(config)
        expected_to_date = expected_sessions_total(config, upto_today=True)

        # Include everyone with a membership — students + reps + admins-with-rep
        students = (
            User.objects
            .filter(membership__isnull=False)
            .order_by("first_name", "username")
        )

        results = []
        for student in students:
            if not counted:
                results.append(_empty_semester_row(
                    student, expected_total, expected_to_date,
                ))
                continue

            all_records = list(
                AttendanceRecord.objects
                .filter(
                    user=student,
                    session__date__gte=counted[0],
                    session__date__lte=counted[-1],
                    session__cancelled=False,
                )
                .select_related("session")
            )
            records = [r for r in all_records if r.session.date in counted_set]

            present = sum(1 for r in records if r.status == AttendanceRecord.STATUS_PRESENT)
            late = sum(1 for r in records if r.status == AttendanceRecord.STATUS_LATE)
            absent = sum(1 for r in records if r.status == AttendanceRecord.STATUS_ABSENT)
            excused = sum(1 for r in records if r.status == AttendanceRecord.STATUS_EXCUSED)
            attended = present + late
            recorded = len(records)

            results.append({
                "user_id": student.id,
                "user_name": student.first_name or student.username,
                "reference_number": student.reference_number,
                "phone_number": student.phone_number,
                "level": student.level,
                "expected_total": expected_total,
                "expected_to_date": expected_to_date,
                "recorded": recorded,
                "present": present,
                "late": late,
                "absent": absent,
                "excused": excused,
                "attended": attended,
                "percentage_vs_expected": (
                    round(attended / expected_to_date * 100, 1)
                    if expected_to_date else 0
                ),
                "percentage_vs_recorded": (
                    round(attended / recorded * 100, 1)
                    if recorded else 0
                ),
            })

        return Response({
            "semester": {
                **build_semester_meta(config),
                "progress": semester_progress(config),
            },
            "totals": {
                "expected_total": expected_total,
                "expected_to_date": expected_to_date,
                "students": len(results),
            },
            "students": results,
        })


def _empty_semester_row(student, expected_total, expected_to_date):
    return {
        "user_id": student.id,
        "user_name": student.first_name or student.username,
        "reference_number": student.reference_number,
        "phone_number": student.phone_number,
        "level": student.level,
        "expected_total": expected_total,
        "expected_to_date": expected_to_date,
        "recorded": 0,
        "present": 0, "late": 0, "absent": 0, "excused": 0,
        "attended": 0,
        "percentage_vs_expected": 0,
        "percentage_vs_recorded": 0,
    }


# ─────────────────────────────────────────────────────────────
# CSV export — all-time + semester (admin only)
# ─────────────────────────────────────────────────────────────
class AttendanceExportView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        today = timezone.now().date()

        config = get_semester_config()
        counted = counted_semester_dates(config) if config else []
        counted_set = set(counted)
        sem_expected_total = expected_sessions_total(config) if config else 0
        sem_expected_to_date = (
            expected_sessions_total(config, upto_today=True) if config else 0
        )

        response = HttpResponse(content_type="text/csv; charset=utf-8")
        sem_slug = (
            config["name"].lower()
            .replace(" ", "-").replace("/", "-").replace("—", "-")
            if config else "current"
        )
        response["Content-Disposition"] = (
            f'attachment; filename="attendance-{sem_slug}-{today}.csv"'
        )
        response.write("\ufeff")  # UTF-8 BOM for Excel

        writer = csv.writer(response)

        writer.writerow([
            "Reference Number", "Full Name", "Phone", "Level",
            "Sessions (All)", "Present (All)", "Late (All)",
            "Absent (All)", "Excused (All)", "Attended (All)",
            "Attendance % (All)",
            "Semester Expected (Total)",
            "Semester Expected (To Date)",
            "Semester Recorded",
            "Semester Present", "Semester Late",
            "Semester Absent", "Semester Excused",
            "Semester Attended",
            "Attendance % (Semester)",
        ])

        # Include everyone with a membership
        students = (
            User.objects
            .filter(membership__isnull=False)
            .order_by("first_name", "username")
        )

        for student in students:
            all_qs = AttendanceRecord.objects.filter(
                user=student, session__cancelled=False,
            )
            all_total = all_qs.count()
            all_present = all_qs.filter(status=AttendanceRecord.STATUS_PRESENT).count()
            all_late = all_qs.filter(status=AttendanceRecord.STATUS_LATE).count()
            all_absent = all_qs.filter(status=AttendanceRecord.STATUS_ABSENT).count()
            all_excused = all_qs.filter(status=AttendanceRecord.STATUS_EXCUSED).count()
            all_attended = all_present + all_late
            all_pct = round(all_attended / all_total * 100, 1) if all_total else 0

            sem_present = sem_late = sem_absent = sem_excused = 0
            sem_recorded = 0
            if counted:
                sem_qs = AttendanceRecord.objects.filter(
                    user=student,
                    session__date__gte=counted[0],
                    session__date__lte=counted[-1],
                    session__cancelled=False,
                ).select_related("session")
                for r in sem_qs:
                    if r.session.date not in counted_set:
                        continue
                    sem_recorded += 1
                    if r.status == AttendanceRecord.STATUS_PRESENT:
                        sem_present += 1
                    elif r.status == AttendanceRecord.STATUS_LATE:
                        sem_late += 1
                    elif r.status == AttendanceRecord.STATUS_ABSENT:
                        sem_absent += 1
                    elif r.status == AttendanceRecord.STATUS_EXCUSED:
                        sem_excused += 1
            sem_attended = sem_present + sem_late
            sem_pct = (
                round(sem_attended / sem_expected_to_date * 100, 1)
                if sem_expected_to_date else 0
            )

            writer.writerow([
                student.reference_number or "",
                student.first_name or student.username,
                student.phone_number or "",
                student.level or "",
                all_total, all_present, all_late, all_absent, all_excused,
                all_attended, f"{all_pct}%",
                sem_expected_total,
                sem_expected_to_date,
                sem_recorded,
                sem_present, sem_late, sem_absent, sem_excused,
                sem_attended,
                f"{sem_pct}%",
            ])

        log(
            request.user, "attendance.export_downloaded",
            students=students.count(),
            semester=(config.get("name") if config else None),
        )

        return response 