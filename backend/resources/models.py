import os
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def resource_upload_to(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"resources/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"


def version_upload_to(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"resources/versions/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{ext}"


class Resource(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
    ]
    TYPE_CHOICES = [
        ("note", "Lecture Note"),
        ("slide", "Slides"),
        ("past_question", "Past Question"),
        ("assignment", "Assignment"),
        ("lab", "Lab Manual"),
        ("project", "Project"),
        ("textbook", "Textbook"),
        ("other", "Other"),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    course_name = models.CharField(max_length=100, db_index=True)
    semester = models.CharField(max_length=20, blank=True, db_index=True)
    resource_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default="other")
    tags = models.CharField(max_length=200, blank=True)

    file = models.FileField(upload_to=resource_upload_to)
    checksum = models.CharField(max_length=64, blank=True)
    size = models.BigIntegerField(default=0)

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, related_name="uploads",
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    version = models.PositiveIntegerField(default=1)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="reviews",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["course_name", "semester"]),
        ]

    def __str__(self):
        return f"{self.title} ({self.course_name})"


class ResourceVersion(models.Model):
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name="versions")
    file = models.FileField(upload_to=version_upload_to)
    version_number = models.PositiveIntegerField()
    checksum = models.CharField(max_length=64, blank=True)
    size = models.BigIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
    )
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version_number"]
        unique_together = ("resource", "version_number")

    def __str__(self):
        return f"{self.resource.title} v{self.version_number}"


class DownloadRecord(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
    )
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name="downloads")
    created_at = models.DateTimeField(auto_now_add=True) 