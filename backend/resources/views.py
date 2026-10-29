import mimetypes
import os

from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.notifications import create_notification
from accounts.permissions import CanReview, role_of
from audit.models import log
from .models import DownloadRecord, Resource, ResourceVersion
from .serializers import (
    ALLOWED_EXT,
    MAX_SIZE,
    ResourceSerializer,
    ResourceVersionSerializer,
    _checksum,
)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
def _mime_for(filename):
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


# ─────────────────────────────────────────────────────────────
# Resource list + create
# ─────────────────────────────────────────────────────────────
class ResourceListCreateView(generics.ListCreateAPIView):
    serializer_class = ResourceSerializer

    def get_queryset(self):
        user = self.request.user
        role = role_of(user)

        qs = Resource.objects.select_related("uploaded_by")

        if role == "student":
            qs = qs.filter(Q(status="approved") | Q(uploaded_by=user))

        p = self.request.query_params

        if p.get("q"):
            q = p["q"]
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(description__icontains=q)
                | Q(course_name__icontains=q)
                | Q(tags__icontains=q)
            )

        for field in ("course_name", "semester", "resource_type", "status"):
            if p.get(field):
                if field == "status" and role == "student":
                    continue
                qs = qs.filter(**{field: p[field]})

        return qs

    def perform_create(self, serializer):
        role = role_of(self.request.user)

        if role in ("rep", "admin"):
            serializer.save(
                uploaded_by=self.request.user,
                status="approved",
                reviewed_by=self.request.user,
                reviewed_at=timezone.now(),
            )
            log(
                self.request.user,
                "resource.created",
                serializer.instance,
                title=serializer.instance.title,
            )
        else:
            serializer.save(uploaded_by=self.request.user, status="pending")


# ─────────────────────────────────────────────────────────────
# Resource detail
# ─────────────────────────────────────────────────────────────
class ResourceDetailView(generics.RetrieveAPIView):
    serializer_class = ResourceSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Resource.objects.select_related("uploaded_by")
        if role_of(user) == "student":
            qs = qs.filter(Q(status="approved") | Q(uploaded_by=user))
        return qs


# ─────────────────────────────────────────────────────────────
# Download (current version)
# ─────────────────────────────────────────────────────────────
class ResourceDownloadView(APIView):
    def get(self, request, pk):
        r = get_object_or_404(Resource, pk=pk)

        if role_of(request.user) == "student":
            if r.status != "approved" and r.uploaded_by_id != request.user.id:
                raise PermissionDenied("Resource is not available.")

        DownloadRecord.objects.create(resource=r, user=request.user)

        f = r.file.open("rb")
        return FileResponse(
            f,
            as_attachment=True,
            filename=os.path.basename(r.file.name),
            content_type="application/octet-stream",
        )


# ─────────────────────────────────────────────────────────────
# Preview inline
# ─────────────────────────────────────────────────────────────
class ResourceViewerView(APIView):
    def get(self, request, pk):
        r = get_object_or_404(Resource, pk=pk)

        if role_of(request.user) == "student":
            if r.status != "approved" and r.uploaded_by_id != request.user.id:
                raise PermissionDenied("Resource is not available.")

        f = r.file.open("rb")
        return FileResponse(
            f,
            as_attachment=False,
            filename=os.path.basename(r.file.name),
            content_type=_mime_for(r.file.name),
        )


# ─────────────────────────────────────────────────────────────
# Review (approve / reject) — rep/admin only
# ─────────────────────────────────────────────────────────────
class ResourceReviewView(APIView):
    permission_classes = [CanReview]

    def post(self, request, pk):
        r = get_object_or_404(Resource, pk=pk)
        decision = request.data.get("decision")

        if decision not in ("approved", "rejected"):
            return Response(
                {"detail": "decision must be 'approved' or 'rejected'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        print(
            f"[REVIEW] actor={request.user.username} "
            f"role={role_of(request.user)} "
            f"resource={r.pk} '{r.title}' "
            f"old_status={r.status} new_status={decision}"
        )

        r.status = decision
        r.reviewed_by = request.user
        r.reviewed_at = timezone.now()
        r.review_note = request.data.get("note", "")
        r.save(update_fields=[
            "status", "reviewed_by", "reviewed_at", "review_note", "updated_at",
        ])

        r.refresh_from_db()

        log(
            request.user, f"resource.{decision}", r,
            note=r.review_note, title=r.title,
        )

        # Notify the uploader (if different from reviewer)
        if r.uploaded_by and r.uploaded_by_id != request.user.pk:
            create_notification(
                user=r.uploaded_by,
                kind=f"resource_{decision}",
                title=f'Your upload "{r.title}" was {decision}',
                body=r.review_note or "",
                link=f"/resources/{r.id}",
                actor=request.user,
            )

        return Response(ResourceSerializer(r).data)


# ─────────────────────────────────────────────────────────────
# Version history
# ─────────────────────────────────────────────────────────────
class ResourceVersionListView(APIView):
    def get(self, request, pk):
        r = get_object_or_404(Resource, pk=pk)

        if role_of(request.user) == "student":
            if r.status != "approved" and r.uploaded_by_id != request.user.id:
                raise PermissionDenied("Resource is not available.")

        versions = r.versions.select_related("uploaded_by").all()
        return Response(ResourceVersionSerializer(versions, many=True).data)


# ─────────────────────────────────────────────────────────────
# Upload new version — rep/admin only
# ─────────────────────────────────────────────────────────────
class ResourceVersionCreateView(APIView):
    permission_classes = [CanReview]

    def post(self, request, pk):
        r = get_object_or_404(Resource, pk=pk)

        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "No file provided."}, status=400)

        ext = os.path.splitext(f.name)[1].lower()
        if ext not in ALLOWED_EXT:
            return Response(
                {"detail": f"File type '{ext}' is not allowed."},
                status=400,
            )
        if f.size > MAX_SIZE:
            return Response(
                {"detail": "File exceeds the 50 MB limit."},
                status=400,
            )

        checksum = _checksum(f)

        r.versions.filter(is_current=True).update(is_current=False)

        new_version = ResourceVersion.objects.create(
            resource=r,
            file=f,
            version_number=r.version + 1,
            checksum=checksum,
            size=f.size,
            uploaded_by=request.user,
            is_current=True,
        )

        r.file.name = new_version.file.name
        r.version += 1
        r.checksum = checksum
        r.size = f.size
        r.save(update_fields=["file", "version", "checksum", "size", "updated_at"])

        log(
            request.user,
            "resource.version_uploaded",
            r,
            version=new_version.version_number,
            title=r.title,
        )

        return Response(ResourceSerializer(r).data, status=201)


# ─────────────────────────────────────────────────────────────
# Download a specific past version
# ─────────────────────────────────────────────────────────────
class ResourceVersionDownloadView(APIView):
    def get(self, request, version_pk):
        rv = get_object_or_404(ResourceVersion, pk=version_pk)
        r = rv.resource

        if role_of(request.user) == "student":
            if r.status != "approved" and r.uploaded_by_id != request.user.id:
                raise PermissionDenied("Resource is not available.")

        DownloadRecord.objects.create(resource=r, user=request.user)

        f = rv.file.open("rb")
        return FileResponse(
            f,
            as_attachment=True,
            filename=os.path.basename(rv.file.name),
            content_type="application/octet-stream",
        ) 