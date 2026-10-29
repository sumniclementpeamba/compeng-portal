from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True, on_delete=models.SET_NULL,
    )
    action = models.CharField(max_length=60)
    target_type = models.CharField(max_length=50, blank=True)
    target_id = models.CharField(max_length=50, blank=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} · {self.action}"


def log(actor, action, target=None, **details):
    AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=type(target).__name__ if target else "",
        target_id=str(target.pk) if target else "",
        details=details,
    ) 