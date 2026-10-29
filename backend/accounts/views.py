import json
import mimetypes
import os
import time
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.db.models import Count, Q
from django.http import FileResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from rest_framework import generics, status
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import CanReview, IsAdminRole, role_of
from audit.models import log
from .models import ClassMembership, Notification, User
from .serializers import (
    MemberListSerializer,
    NotificationSerializer,
    RegisterSerializer,
    UserSerializer,
)


# ─────────────────────────────────────────────────────────────
# Register
# ─────────────────────────────────────────────────────────────
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        if request.data.get("access_code") != settings.CLASS_ACCESS_CODE:
            return Response(
                {"detail": "Invalid class access code."},
                status=status.HTTP_403_FORBIDDEN,
            )
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"token": token.key, "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


# ─────────────────────────────────────────────────────────────
# Login
# ─────────────────────────────────────────────────────────────
class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        # 1. Direct username match
        user = authenticate(username=raw, password=password)

        # 2. Slugified version
        if not user:
            slug = slugify(raw)
            if slug and slug != raw:
                user = authenticate(username=slug, password=password)

        # 3. Exact full-name match
        if not user and raw:
            matches = User.objects.filter(first_name__iexact=raw)
            if matches.count() == 1:
                candidate = matches.first()
                if candidate.check_password(password):
                    user = candidate

        if not user:
            return Response({"detail": "Invalid credentials."}, status=400)

        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


# ─────────────────────────────────────────────────────────────
# Me
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
# Members — list + avatar + role change
# ─────────────────────────────────────────────────────────────
class MemberListView(generics.ListAPIView):
    serializer_class = MemberListSerializer
    permission_classes = [CanReview]

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
    """Server-Sent Events stream of new notifications for the logged-in user.

    Auth via header OR ?token=<key>. EventSource can't send custom headers,
    so the query-token path is required for the live stream specifically.
    """
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