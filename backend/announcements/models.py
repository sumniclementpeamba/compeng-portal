from django.conf import settings
from django.db import models


class Announcement(models.Model):
    title = models.CharField(max_length=200)
    body = models.TextField()
    course_name = models.CharField(max_length=100, blank=True)
    pinned = models.BooleanField(default=False)
    expires_at = models.DateTimeField(null=True, blank=True)

    audio = models.FileField(
        upload_to="announcements/audio/%Y/%m/",
        null=True,
        blank=True,
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-pinned", "-created_at"]

    def __str__(self):
        return self.title 