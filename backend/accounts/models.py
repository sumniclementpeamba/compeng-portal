from django.contrib.auth.models import AbstractUser
from django.db import models


# ─────────────────────────────────────────────────────────────
# Reference numbers are 9 characters in the class CSV.
# Example: UA2600133
# ─────────────────────────────────────────────────────────────
REFERENCE_NUMBER_MAX_LEN = 9


class User(AbstractUser):
    matric_no = models.CharField(max_length=30, blank=True)
    level = models.CharField(max_length=10, blank=True)

    # "Number" column from the class CSV — typically a phone number.
    phone_number = models.CharField(max_length=30, blank=True)

    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)

    # Reference number from the admission letter / class list.
    # Example: UA2600133 (9 chars). Unique so no two students share one.
    # Nullable so admin accounts created outside the CSV flow are unaffected.
    reference_number = models.CharField(
        max_length=REFERENCE_NUMBER_MAX_LEN,
        blank=True,
        null=True,
        unique=True,
        db_index=True,
    )

    def __str__(self):
        return self.username


class ClassMembership(models.Model):
    ROLE_STUDENT = "student"
    ROLE_REP = "rep"
    ROLE_ADMIN = "admin"

    ROLE_CHOICES = [
        (ROLE_STUDENT, "Student"),
        (ROLE_REP, "Course Representative"),
        (ROLE_ADMIN, "Administrator"),
    ]

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="membership"
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_STUDENT)
    joined_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Notification(models.Model):
    KIND_CHOICES = [
        ("announcement", "Announcement"),
        ("resource_approved", "Resource Approved"),
        ("resource_rejected", "Resource Rejected"),
        ("role_changed", "Role Changed"),
    ]

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="notifications",
    )
    actor = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+",
    )
    kind = models.CharField(max_length=30, choices=KIND_CHOICES)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "is_read"]),
        ]

    def __str__(self):
        return f"{self.user.username} · {self.kind} · {self.title}" 