import csv
import io
import json
import mimetypes
import os
import time
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.core.files.uploadedfile import UploadedFile
from django.db.models import Count, Q
from django.http import FileResponse, HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from rest_framework import generics, status
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanReview, IsAdminRole, role_of
from audit.models import log
from .csv_import import import_members_from_csv
from .models import (
    ClassMembership,
    FaceEnrollmentSetting,
    Notification,
    User,
)
from .serializers import (
    MemberListSerializer,
    NotificationSerializer,
    RegisterSerializer,
    UserSerializer,
)

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from attendance.face import extract_embedding

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _looks_like_reference(value: str) -> bool:
    """A reference number is 9 alphanumeric characters, e.g. UA2613334."""
    if not value:
        return False
    s = value.strip()
    return len(s) == 9 and s.isalnum()


def _build_member_rows():
    """Return (headers, rows) shared by both CSV and XLSX export.

    Centralized so the two formats stay in sync forever.
    """
    headers = [
        "Reference Number", "Full Name", "Contact",
        "Index Number", "Level", "Role", "Email", "Joined",
    ]

    users = (
        User.objects
        .filter(membership__isnull=False)
        .select_related("membership")
        .order_by("first_name", "username")
    )

    rows = []
    for u in users:
        m = getattr(u, "membership", None)
        rows.append([
            u.reference_number or "",
            u.first_name or u.username,
            u.phone_number or "",
            u.index_number or "",
            u.level or "",
            role_of(u),
            u.email or "",
            m.joined_at.strftime("%Y-%m-%d") if m and m.joined_at else "",
        ])

    return headers, rows, users.count()


# ─────────────────────────────────────────────────────────────
# Register — admin-only, manual account creation
# ─────────────────────────────────────────────────────────────
class RegisterView(APIView):
    permission_classes = [IsAdminRole]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


# ─────────────────────────────────────────────────────────────
# Login — reference number first, then legacy fallbacks
# ─────────────────────────────────────────────────────────────
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        if not raw or not password:
            return Response(
                {"detail": "Reference number and password are required."},
                status=400,
            )

        candidates = []
        seen_ids = set()

        def add_candidates(qs):
            for u in qs:
                if u.pk not in seen_ids:
                    seen_ids.add(u.pk)
                    candidates.append(u)

        add_candidates(User.objects.filter(reference_number__iexact=raw)[:5])
        add_candidates(User.objects.filter(username=raw)[:5])

        slug = slugify(raw)
        if slug and slug != raw:
            add_candidates(User.objects.filter(username=slug)[:5])

        add_candidates(User.objects.filter(first_name__iexact=raw)[:5])

        for user in candidates:
            if user.check_password(password):
                if _looks_like_reference(raw) and not user.reference_number:
                    already_taken = User.objects.filter(
                        reference_number__iexact=raw
                    ).exclude(pk=user.pk).exists()
                    if not already_taken:
                        user.reference_number = raw.upper()
                        user.save(update_fields=["reference_number"])

                token, _ = Token.objects.get_or_create(user=user)
                return Response({
                    "token": token.key,
                    "user": UserSerializer(user).data,
                })

        return Response(
            {"detail": "Invalid reference number or password."},
            status=400,
        )


# ─────────────────────────────────────────────────────────────
# Me — get / patch own profile
# ─────────────────────────────────────────────────────────────
class MeView(APIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        if str(request.data.get("avatar_clear", "")).lower() == "true":
            if request.user.avatar:
                request.user.avatar.delete(save=False)
            request.user.avatar = None
            request.user.save(update_fields=["avatar"])

        s = UserSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(UserSerializer(request.user).data)


# ─────────────────────────────────────────────────────────────
# Own avatar — GET (?token=) / DELETE
# ─────────────────────────────────────────────────────────────
class MeAvatarView(APIView):
    def get_permissions(self):
        return []

    def _resolve_user(self, request):
        if request.user and request.user.is_authenticated:
            return request.user
        token_key = request.query_params.get("token")
        if token_key:
            try:
                return Token.objects.select_related("user").get(key=token_key).user
            except Token.DoesNotExist:
                return None
        return None

    def get(self, request):
        user = self._resolve_user(request)
        if not user:
            return Response({"detail": "Auth required."}, status=401)
        if not user.avatar:
            return Response({"detail": "No avatar."}, status=404)

        mime, _ = mimetypes.guess_type(user.avatar.name)
        f = user.avatar.open("rb")
        return FileResponse(
            f,
            as_attachment=False,
            filename=os.path.basename(user.avatar.name),
            content_type=mime or "image/jpeg",
        )

    def delete(self, request):
        if not request.user or not request.user.is_authenticated:
            return Response({"detail": "Auth required."}, status=401)
        if request.user.avatar:
            request.user.avatar.delete(save=False)
        request.user.avatar = None
        request.user.save(update_fields=["avatar"])
        return Response(status=204)


# ─────────────────────────────────────────────────────────────
# Members — list (no pagination; class roster is a fixed set)
# ─────────────────────────────────────────────────────────────
class MemberListView(generics.ListAPIView):
    serializer_class = MemberListSerializer
    permission_classes = [CanReview]
    pagination_class = None

    def get_queryset(self):
        qs = (
            User.objects
            .select_related("membership")
            .annotate(
                uploads_count=Count(
                    "uploads",
                    filter=Q(uploads__status="approved"),
                    distinct=True,
                ),
                pending_count=Count(
                    "uploads",
                    filter=Q(uploads__status="pending"),
                    distinct=True,
                ),
            )
            .order_by("first_name", "username")
        )

        p = self.request.query_params

        q = p.get("q")
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q)
                | Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(reference_number__icontains=q)
                | Q(phone_number__icontains=q)
                | Q(index_number__icontains=q)
            )

        role = p.get("role")
        if role == "admin":
            qs = qs.filter(is_superuser=True)
        elif role == "rep":
            qs = qs.filter(is_superuser=False, membership__role="rep")
        elif role == "student":
            qs = qs.filter(
                Q(is_superuser=False)
                & (
                    Q(membership__isnull=True)
                    | Q(membership__role="student")
                )
            )

        level = p.get("level")
        if level:
            qs = qs.filter(level=level)

        return qs


# ─────────────────────────────────────────────────────────────
# Any member's avatar — rep/admin only
# ─────────────────────────────────────────────────────────────
class MemberAvatarView(APIView):
    authentication_classes = []
    permission_classes = []

    def _resolve_user(self, request):
        if request.user and request.user.is_authenticated:
            return request.user
        token_key = request.query_params.get("token")
        if token_key:
            try:
                return Token.objects.select_related("user").get(key=token_key).user
            except Token.DoesNotExist:
                return None
        return None

    def get(self, request, user_id):
        requester = self._resolve_user(request)
        if not requester:
            return Response({"detail": "Auth required."}, status=401)
        if role_of(requester) not in ("rep", "admin"):
            return Response({"detail": "Forbidden."}, status=403)

        target = get_object_or_404(User, pk=user_id)
        if not target.avatar:
            return Response({"detail": "No avatar."}, status=404)

        mime, _ = mimetypes.guess_type(target.avatar.name)
        f = target.avatar.open("rb")
        return FileResponse(
            f,
            as_attachment=False,
            filename=os.path.basename(target.avatar.name),
            content_type=mime or "image/jpeg",
        )


# ─────────────────────────────────────────────────────────────
# Change a member's role — admin only
# ─────────────────────────────────────────────────────────────
class MemberRoleUpdateView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request, user_id):
        target = get_object_or_404(User, pk=user_id)
        new_role = request.data.get("role")

        if new_role not in ("student", "rep"):
            return Response(
                {"detail": "role must be 'student' or 'rep'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target.is_superuser:
            return Response(
                {"detail": "Superuser roles are managed in Django admin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target.pk == request.user.pk:
            return Response(
                {"detail": "You cannot change your own role."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership, _ = ClassMembership.objects.get_or_create(user=target)
        old_role = membership.role

        if old_role == new_role:
            return Response(
                {"detail": f"{target.username} is already a {new_role}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership.role = new_role
        membership.save()

        log(
            request.user,
            "member.role_changed",
            target,
            title=target.first_name or target.username,
            old_role=old_role,
            new_role=new_role,
        )

        return Response({
            "id": target.pk,
            "username": target.username,
            "display_name": target.first_name or target.username,
            "role": role_of(target),
        })


# ─────────────────────────────────────────────────────────────
# CSV import of class roster — admin only
# ─────────────────────────────────────────────────────────────
class MemberCSVUploadView(APIView):
    permission_classes = [IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        file: UploadedFile = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file uploaded."}, status=400)
        if not file.name.lower().endswith(".csv"):
            return Response({"detail": "File must be a .csv"}, status=400)

        password = getattr(settings, "GENERAL_PASSWORD", "compeng-2026")

        try:
            result = import_members_from_csv(file, password)
        except Exception as e:
            return Response({"detail": str(e)}, status=400)

        log(
            request.user,
            "members.csv_imported",
            created=result["created"],
            updated=result["updated"],
            errors=len(result["errors"]),
        )

        return Response({
            **result,
            "password": password,
        })


# ─────────────────────────────────────────────────────────────
# Force-reset all non-admin passwords to the general password
# ─────────────────────────────────────────────────────────────
class ResetAllPasswordsView(APIView):
    permission_classes = [IsAdminRole]

    def post(self, request):
        password = getattr(settings, "GENERAL_PASSWORD", "compeng-2026")

        users = User.objects.filter(is_superuser=False, is_staff=False)
        count = 0
        for user in users:
            user.set_password(password)
            user.save(update_fields=["password"])
            count += 1

        log(request.user, "members.passwords_reset", count=count)

        return Response({
            "reset": count,
            "password": password,
        })


# ─────────────────────────────────────────────────────────────
# Export all members — CSV or XLSX (admin only)
# ─────────────────────────────────────────────────────────────
class MemberExportView(APIView):
    """Download every class member's details.

    Query params:
        ?format=csv   → plain UTF-8 CSV with BOM (default)
        ?format=xlsx  → Excel workbook with styled header, autosized
                        columns, and frozen header row

    Admin only.
    """

    permission_classes = [IsAdminRole]

    def get(self, request):
        fmt = (request.query_params.get("format") or "csv").lower()
        if fmt not in ("csv", "xlsx"):
            fmt = "csv"

        headers, rows, count = _build_member_rows()
        today = timezone.now().date()

        if fmt == "xlsx":
            response = self._build_xlsx(headers, rows, today)
        else:
            response = self._build_csv(headers, rows, today)

        log(request.user, "members.exported", format=fmt, count=count)

        return response

    def _build_csv(self, headers, rows, today):
        response = HttpResponse(content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = (
            f'attachment; filename="members-{today}.csv"'
        )
        response.write("\ufeff")  # UTF-8 BOM so Excel opens cleanly

        writer = csv.writer(response)
        writer.writerow(headers)
        for row in rows:
            writer.writerow(row)

        return response

    def _build_xlsx(self, headers, rows, today):
        wb = Workbook()
        ws = wb.active
        ws.title = "Members"

        # Header styling
        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(
            start_color="1D4ED8", end_color="1D4ED8", fill_type="solid",
        )
        header_align = Alignment(horizontal="left", vertical="center")

        for col_idx, header in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align

        # Data rows
        for row_idx, row in enumerate(rows, start=2):
            for col_idx, value in enumerate(row, start=1):
                ws.cell(row=row_idx, column=col_idx, value=value)

        # Autosize columns
        for col_idx in range(1, len(headers) + 1):
            col_letter = ws.cell(row=1, column=col_idx).column_letter
            max_len = len(str(headers[col_idx - 1]))
            for row_idx in range(2, len(rows) + 2):
                val = ws.cell(row=row_idx, column=col_idx).value
                if val is not None:
                    max_len = max(max_len, len(str(val)))
            ws.column_dimensions[col_letter].width = min(max_len + 2, 40)

        # Freeze header row so it stays visible while scrolling
        ws.freeze_panes = "A2"

        # Row height for header
        ws.row_dimensions[1].height = 22

        # Write to buffer
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        response = HttpResponse(
            buffer.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument"
                ".spreadsheetml.sheet"
            ),
        )
        response["Content-Disposition"] = (
            f'attachment; filename="members-{today}.xlsx"'
        )
        return response


# ─────────────────────────────────────────────────────────────
# Notifications — REST
# ─────────────────────────────────────────────────────────────
class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return self.request.user.notifications.select_related("actor").all()


class NotificationUnreadCountView(APIView):
    def get(self, request):
        count = request.user.notifications.filter(is_read=False).count()
        return Response({"count": count})


class NotificationMarkReadView(APIView):
    def post(self, request, pk):
        try:
            n = request.user.notifications.get(pk=pk)
        except Notification.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        if not n.is_read:
            n.is_read = True
            n.save(update_fields=["is_read"])
        return Response({"ok": True})


class NotificationMarkAllReadView(APIView):
    def post(self, request):
        request.user.notifications.filter(is_read=False).update(is_read=True)
        return Response({"ok": True})


# ─────────────────────────────────────────────────────────────
# Notifications — SSE stream
# ─────────────────────────────────────────────────────────────
@csrf_exempt
def notification_stream(request):
    user = request.user if getattr(request.user, "is_authenticated", False) else None
    if not user:
        token_key = request.GET.get("token")
        if token_key:
            try:
                user = Token.objects.select_related("user").get(key=token_key).user
            except Token.DoesNotExist:
                pass
    if not user:
        return JsonResponse({"detail": "Auth required."}, status=401)

    def event_stream():
        last_seen = timezone.now() - timedelta(seconds=3)
        try:
            yield ": connected\n\n"
            while True:
                qs = (
                    Notification.objects
                    .filter(user=user, created_at__gt=last_seen)
                    .order_by("created_at")[:20]
                )
                any_sent = False
                for n in qs:
                    payload = {
                        "id": n.pk,
                        "kind": n.kind,
                        "title": n.title,
                        "body": n.body,
                        "link": n.link,
                        "is_read": n.is_read,
                        "created_at": n.created_at.isoformat(),
                        "actor_name": (n.actor.first_name or n.actor.username) if n.actor else None,
                    }
                    yield f"data: {json.dumps(payload)}\n\n"
                    last_seen = n.created_at
                    any_sent = True

                if not any_sent:
                    yield f": heartbeat {int(time.time())}\n\n"
                time.sleep(2)
        except GeneratorExit:
            return

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response


# ─────────────────────────────────────────────────────────────
# Members summary — quick completeness counts (rep/admin)
# ─────────────────────────────────────────────────────────────
class MemberSummaryView(APIView):
    """Counts of members by profile completeness.

    "Complete" = has a non-empty phone_number AND a non-empty
    index_number. These are the two fields the rep needs to run
    attendance and reach students. Email and level are optional.

    Reps need this too — they're the ones who chase students
    for their missing details.
    """

    permission_classes = [CanReview]

    def get(self, request):
        qs = User.objects.filter(membership__isnull=False)
        total = qs.count()

        has_phone = ~Q(phone_number="") & ~Q(phone_number__isnull=True)
        has_index = ~Q(index_number="") & ~Q(index_number__isnull=True)

        complete = qs.filter(has_phone, has_index).count()
        incomplete = total - complete

        missing_phone = qs.filter(~has_phone).count()
        missing_index = qs.filter(~has_index).count()

        return Response({
            "total": total,
            "complete": complete,
            "incomplete": incomplete,
            "missing_phone": missing_phone,
            "missing_index": missing_index,
        })


# ─────────────────────────────────────────────────────────────
# Face verification — status / enroll / delete
# ─────────────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def face_status(request):
    u = request.user
    setting = FaceEnrollmentSetting.get_solo()
    return Response({
        'enrolled': bool(u.face_embedding),
        'enrolled_at': u.face_enrolled_at,
        'consent': u.face_consent_given,
        'consent_at': u.face_consent_at,
        # System-wide flags — the frontend uses these to gate the UI
        'enrollment_open': setting.is_open,
        'enrollment_updated_at': setting.updated_at,
        'enrollment_updated_by': (
            (setting.updated_by.first_name or setting.updated_by.username)
            if setting.updated_by else None
        ),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def face_enroll(request):
    # Gate: admin must have opened enrollment
    setting = FaceEnrollmentSetting.get_solo()
    if not setting.is_open:
        return Response(
            {
                'detail': (
                    'Face enrollment is currently closed by the course admin. '
                    'They will open it when it is time for the class to enrol. '
                    'You can still check in to class if you have already enrolled.'
                ),
                'reason': 'enrollment_closed',
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.data.get('consent') not in ('true', 'True', True):
        return Response(
            {'detail': 'Consent is required to enroll face verification.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    photo = request.FILES.get('photo')
    if not photo:
        return Response({'detail': 'No photo provided.'}, status=400)
    if photo.size > 5 * 1024 * 1024:
        return Response({'detail': 'Photo too large (max 5 MB).'}, status=400)

    img_bytes = photo.read()
    embedding, err = extract_embedding(img_bytes)
    if err:
        code = (
            'No face detected — try better lighting and centre your face.'
            if err == 'no_face'
            else f'Could not process image ({err}).'
        )
        return Response({'detail': code}, status=400)

    u = request.user
    u.face_embedding = embedding
    u.face_enrolled_at = timezone.now()
    u.face_consent_given = True
    u.face_consent_at = timezone.now()
    if u.face_enrollment_photo:
        u.face_enrollment_photo.delete(save=False)
    u.face_enrollment_photo = photo
    u.save(update_fields=[
        'face_embedding', 'face_enrolled_at', 'face_consent_given',
        'face_consent_at', 'face_enrollment_photo',
    ])
    return Response({'ok': True, 'enrolled_at': u.face_enrolled_at})


@api_view(['DELETE', 'POST'])
@permission_classes([IsAuthenticated])
def face_delete(request):
    """Delete the requesting user's face data.

    Accepts both DELETE and POST — the frontend's shared api client
    doesn't expose delete, so POST is provided as an equivalent path
    for the "Remove my face data" action.

    NOT gated by enrollment_open: students must always be able to
    remove their biometric data.
    """
    u = request.user
    if u.face_enrollment_photo:
        u.face_enrollment_photo.delete(save=False)
    u.face_embedding = None
    u.face_enrolled_at = None
    u.face_consent_given = False
    u.face_consent_at = None
    u.face_enrollment_photo = None
    u.save(update_fields=[
        'face_embedding', 'face_enrolled_at', 'face_consent_given',
        'face_consent_at', 'face_enrollment_photo',
    ])
    return Response(status=204)


# ─────────────────────────────────────────────────────────────
# Face enrollment setting — system-wide toggle (admin)
# ─────────────────────────────────────────────────────────────
class FaceEnrollmentSettingView(APIView):
    """Read/write the face enrollment open/closed flag.

    GET  — any authenticated user (students need to know whether
           to show the "Start enrollment" button)
    POST — admin only (opens or closes enrollment system-wide)
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def _serialize(self, setting):
        return {
            'is_open': setting.is_open,
            'updated_at': setting.updated_at,
            'updated_by_name': (
                (setting.updated_by.first_name or setting.updated_by.username)
                if setting.updated_by else None
            ),
        }

    def get(self, request):
        return Response(self._serialize(FaceEnrollmentSetting.get_solo()))

    def post(self, request):
        is_open = request.data.get('is_open')
        if not isinstance(is_open, bool):
            return Response(
                {'detail': 'is_open must be true or false.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        setting = FaceEnrollmentSetting.get_solo()
        prev = setting.is_open
        setting.is_open = is_open
        setting.updated_by = request.user
        setting.save()

        log(
            request.user,
            'face_enrollment.toggled',
            is_open=is_open,
            previous=prev,
        )

        return Response(self._serialize(setting)) 