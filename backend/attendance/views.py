import csv
from datetime import datetime, timedelta

from django.conf import settings
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
from .face import verify as verify_face
from .geo import evaluate_geofence, get_client_ip, is_campus_ip
from .models import (
    AttendanceRecord, AttendanceSession, DeviceRecord, TimetableEntry,
)
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
    if not session.check_in_closes_at:
        return False
    return timezone.now() >= session.check_in_closes_at


def _eligible_users():
    return User.objects.filter(membership__isnull=False)


def _compute_late_threshold(session):
    if session.late_after_at:
        return session.late_after_at
    if session.check_in_opens_at:
        return session.check_in_opens_at + timedelta(
            minutes=session.late_after_minutes
        )
    return None


# ─────────────────────────────────────────────────────────────
# Auto-session generation from timetable
# ─────────────────────────────────────────────────────────────
def ensure_todays_sessions_for_user(user):
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
                "classroom_lat": entry.latitude,
                "classroom_lng": entry.longitude,
                "geofence_radius_meters": entry.geofence_radius_meters,
                "require_location": entry.require_location,
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


# ─────────────────────────────────────────────────────────────
# Timetable CRUD
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

        if session.timetable_entry:
            session.classroom_lat = session.timetable_entry.latitude
            session.classroom_lng = session.timetable_entry.longitude
            session.geofence_radius_meters = (
                session.timetable_entry.geofence_radius_meters
            )
            session.require_location = session.timetable_entry.require_location
            session.save(update_fields=[
                "classroom_lat", "classroom_lng",
                "geofence_radius_meters", "require_location",
            ])

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
    serializer_class = AttendanceSessionDetailSerializer
    permission_classes = [CanReview]

    def get_queryset(self):
        return (
            AttendanceSession.objects
            .select_related("created_by")
            .prefetch_related("records__user")
        )


# ─────────────────────────────────────────────────────────────
# Cancel / open / close
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
# Self check-in — GPS + device fingerprint + FACE VERIFICATION
# ─────────────────────────────────────────────────────────────
class AttendanceSelfCheckInView(APIView):
    """Student self check-in with GPS + device fingerprint + face match.

    Accepts JSON or multipart. With multipart, `gps` is a JSON string.

    Fields (all optional but affect flags):
      - gps: {lat, lng, accuracy} or JSON string
      - fingerprint: device hash
      - photo: JPEG/PNG for face verification

    Responses:
      200 {ok, status, flags, needs_review, face_verified, face_distance, record}
      400 {detail, reason?}  bad state or no_face
      403 {detail, reason}   outside_geofence | duplicate_device | face_mismatch
    """

    def post(self, request, pk):
        session = get_object_or_404(AttendanceSession, pk=pk)

        # ── State checks ────────────────────────────────────
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
                    {"detail": "Check-in has not been opened yet."},
                    status=400,
                )
            if now >= session.check_in_closes_at:
                return Response(
                    {"detail": "The check-in window has closed."},
                    status=400,
                )
            return Response(
                {"detail": "Check-in is not open right now."},
                status=400,
            )

        # ── Parse GPS (handles JSON dict or multipart string) ──
        import json as _json
        gps_raw = request.data.get("gps")
        if isinstance(gps_raw, str):
            try:
                gps = _json.loads(gps_raw) if gps_raw else {}
            except _json.JSONDecodeError:
                return Response({"detail": "Invalid GPS data."}, status=400)
        else:
            gps = gps_raw or {}

        try:
            student_lat = (
                float(gps["lat"]) if gps.get("lat") is not None else None
            )
            student_lng = (
                float(gps["lng"]) if gps.get("lng") is not None else None
            )
            student_accuracy = (
                float(gps["accuracy"])
                if gps.get("accuracy") is not None
                else None
            )
        except (TypeError, ValueError, KeyError):
            return Response({"detail": "Invalid GPS data."}, status=400)

        fingerprint = (request.data.get("fingerprint") or "").strip()[:64]
        photo_file = request.FILES.get("photo")

        # ── Device fingerprint duplicate check ──────────────
        if fingerprint:
            conflict = (
                session.device_records
                .exclude(user=request.user)
                .filter(fingerprint=fingerprint)
                .exists()
            )
            if conflict:
                return Response(
                    {
                        "detail": "This device has already checked in "
                                  "another student for this session.",
                        "reason": "duplicate_device",
                    },
                    status=403,
                )

        # ── Geofence evaluation ────────────────────────────
        flags = []
        distance = None
        geofence_result = "no_geofence"

        if session.require_location:
            geofence_result, distance = evaluate_geofence(
                student_lat, student_lng, student_accuracy,
                session.classroom_lat, session.classroom_lng,
                session.geofence_radius_meters,
            )

            if geofence_result == "outside":
                return Response(
                    {
                        "detail": "You appear to be outside the classroom. "
                                  "If this is wrong, tap 'Request review' "
                                  "to message your course rep.",
                        "reason": "outside_geofence",
                        "distance_meters": (
                            round(distance, 1) if distance else None
                        ),
                        "radius_meters": session.geofence_radius_meters,
                    },
                    status=403,
                )
            if geofence_result == "low_accuracy":
                flags.append("low_accuracy")
            elif geofence_result == "uncertain":
                flags.append("uncertain_geofence")
            elif geofence_result == "no_gps":
                flags.append("no_gps")

        # ── Face verification ──────────────────────────────
        face_flags = []
        face_distance = None
        face_verified = False

        enrolled_embedding = getattr(request.user, "face_embedding", None)

        if not enrolled_embedding:
            face_flags.append("face_not_enrolled")
        elif not photo_file:
            face_flags.append("face_missing")
        else:
            try:
                img_bytes = photo_file.read()
            except Exception:
                img_bytes = b""

            result = verify_face(enrolled_embedding, img_bytes)
            face_distance = result["distance"]

            if result["error"] == "no_face":
                return Response(
                    {
                        "detail": "No face detected in the photo. "
                                  "Try again with better lighting and "
                                  "your face centred.",
                        "reason": "no_face",
                    },
                    status=400,
                )
            if not result["ok"]:
                face_flags.append("face_error")
            elif result["match"]:
                face_verified = True
            elif result["needs_review"]:
                face_verified = True
                face_flags.append("face_borderline")
            else:
                return Response(
                    {
                        "detail": "That doesn't match the photo on your "
                                  "profile. If you've changed appearance "
                                  "(haircut, glasses), re-enroll your face "
                                  "in Profile. If this is wrong, message "
                                  "your course rep.",
                        "reason": "face_mismatch",
                        "distance": face_distance,
                    },
                    status=403,
                )

        # ── IP consistency (soft flag) ─────────────────────
        campus_networks = getattr(settings, "CAMPUS_NETWORKS", [])
        client_ip = get_client_ip(request)
        if campus_networks and client_ip:
            if not is_campus_ip(client_ip, campus_networks):
                flags.append("off_campus_network")

        all_flags = flags + face_flags

        # ── Get the attendance record ──────────────────────
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
                {"detail": f"Your record is already marked "
                           f"'{record.status}'. Contact the admin if "
                           f"this is wrong."},
                status=400,
            )
        if record.marked_by_id and record.marked_by_id != request.user.pk:
            return Response(
                {"detail": "Your record was already marked by an admin."},
                status=400,
            )

        # ── Register device fingerprint ────────────────────
        if fingerprint:
            try:
                DeviceRecord.objects.create(
                    fingerprint=fingerprint,
                    session=session,
                    user=request.user,
                )
            except IntegrityError:
                return Response(
                    {
                        "detail": "This device has already checked in "
                                  "for this session.",
                        "reason": "duplicate_device",
                    },
                    status=403,
                )

        # ── Present vs late ────────────────────────────────
        late_threshold = _compute_late_threshold(session)
        new_status = (
            AttendanceRecord.STATUS_LATE
            if late_threshold and now >= late_threshold
            else AttendanceRecord.STATUS_PRESENT
        )

        # ── Persist ────────────────────────────────────────
        record.status = new_status
        record.check_in_method = AttendanceRecord.METHOD_SELF
        record.marked_by = request.user
        record.check_in_gps_lat = student_lat
        record.check_in_gps_lng = student_lng
        record.check_in_gps_accuracy = student_accuracy
        record.check_in_ip = client_ip
        record.check_in_flags = all_flags
        record.needs_review = bool(all_flags)
        record.face_verified = face_verified
        record.face_distance = face_distance
        record.face_flags = face_flags
        if photo_file:
            try:
                photo_file.seek(0)
                record.face_capture = photo_file
            except Exception:
                pass
        record.save(update_fields=[
            "status", "check_in_method", "marked_by", "marked_at",
            "check_in_gps_lat", "check_in_gps_lng", "check_in_gps_accuracy",
            "check_in_ip", "check_in_flags", "needs_review",
            "face_verified", "face_distance", "face_flags", "face_capture",
        ])

        log(
            request.user, "attendance.self_check_in", session,
            title=session.title, status=new_status,
            flags=all_flags, distance=distance,
            face_verified=face_verified, face_distance=face_distance,
        )

        return Response({
            "ok": True,
            "status": new_status,
            "flags": all_flags,
            "needs_review": bool(all_flags),
            "face_verified": face_verified,
            "face_distance": face_distance,
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
# Bulk mark — admin only
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
# CSV export
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
        response.write("\ufeff")

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


# ─────────────────────────────────────────────────────────────
# Review a flagged check-in — rep or admin
# ─────────────────────────────────────────────────────────────
class AttendanceRecordReviewView(APIView):
    permission_classes = [CanReview]

    def post(self, request, pk):
        record = get_object_or_404(AttendanceRecord, pk=pk)

        if not record.needs_review:
            return Response(
                {"detail": "This record is not flagged for review."},
                status=400,
            )

        decision = request.data.get("decision")
        note = (request.data.get("note") or "").strip()

        if decision not in ("approve", "reject"):
            return Response(
                {"detail": "decision must be 'approve' or 'reject'."},
                status=400,
            )

        if decision == "approve":
            record.needs_review = False
            record.note = note or "Approved after manual review"
        else:
            record.status = AttendanceRecord.STATUS_ABSENT
            record.needs_review = False
            record.note = note or "Rejected — marked absent after review"
            record.check_in_method = AttendanceRecord.METHOD_REP

        record.marked_by = request.user
        record.save(update_fields=[
            "status", "needs_review", "note", "marked_by", "marked_at",
            "check_in_method",
        ])

        log(
            request.user, f"attendance.check_in_{decision}d",
            record.session,
            record_id=record.id, user_id=record.user_id,
            flags=record.check_in_flags,
        )

        return Response(AttendanceRecordSerializer(record).data) 


class UpcomingSessionsView(APIView):
    """
    Next N classes from the timetable, with computed check-in windows.
    Does NOT create AttendanceSession rows — informational only.
    """
    def get(self, request):
        from datetime import datetime as _dt, timedelta as _td
        from django.utils import timezone as _tz

        now = _tz.now()
        tz = _tz.get_current_timezone()
        try:
            lookahead_days = min(int(request.query_params.get('days', 7)), 30)
            limit = min(int(request.query_params.get('limit', 5)), 20)
        except (TypeError, ValueError):
            lookahead_days, limit = 7, 5

        results = []
        for day_offset in range(lookahead_days + 1):
            if len(results) >= limit:
                break
            check_date = (now + _td(days=day_offset)).date()
            day_of_week = check_date.weekday()

            entries = TimetableEntry.objects.filter(
                active=True, day_of_week=day_of_week
            ).order_by('start_time')

            for entry in entries:
                if len(results) >= limit:
                    break

                class_start = _tz.make_aware(
                    _dt.combine(check_date, entry.start_time), tz
                )
                class_end = _tz.make_aware(
                    _dt.combine(check_date, entry.end_time), tz
                )
                opens_at = class_start - _td(
                    minutes=entry.check_in_starts_minutes_before
                )
                closes_at = class_end + _td(
                    minutes=entry.check_in_ends_minutes_after
                )

                if closes_at < now:
                    continue  # already past

                results.append({
                    'timetable_entry_id': entry.id,
                    'course_code': entry.course_code,
                    'course_title': entry.course_title,
                    'date': str(check_date),
                    'start_time': entry.start_time.strftime('%H:%M'),
                    'end_time': entry.end_time.strftime('%H:%M'),
                    'room': getattr(entry, 'room', None),
                    'check_in_opens_at': opens_at.isoformat(),
                    'check_in_closes_at': closes_at.isoformat(),
                    'opens_in_seconds': max(0, int((opens_at - now).total_seconds())),
                    'closes_in_seconds': max(0, int((closes_at - now).total_seconds())),
                    'is_open_now': opens_at <= now < closes_at,
                })

        return Response({'results': results})        