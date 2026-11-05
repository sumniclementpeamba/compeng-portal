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
    index_number = models.CharField(max_length=30, blank=True) 
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    
    # --- Face verification ---
    face_embedding = models.JSONField(null=True, blank=True)          # 512-float list
    face_enrolled_at = models.DateTimeField(null=True, blank=True)
    face_consent_given = models.BooleanField(default=False)
    face_consent_at = models.DateTimeField(null=True, blank=True)
    face_enrollment_photo = models.ImageField(
        upload_to='face/enroll/', null=True, blank=True,
    )  # access-controlled — for rep/admin review only

    

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
    

class FaceEnrollmentSetting(models.Model):
    """Singleton that toggles whether students can enrol their face.

    Default: closed. The admin must explicitly open it from the
    dashboard before any new enrollment is accepted.

    Enrolled students are unaffected by the flag — they can still
    check in, re-enrol, and remove their data at any time. The flag
    only gates NEW enrollments.
    """
    is_open = models.BooleanField(
        default=False,
        help_text="Whether students can currently enrol their face.",
    )
    updated_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Face enrollment setting"
        verbose_name_plural = "Face enrollment settings"

    def __str__(self):
        return f"Face enrollment: {'open' if self.is_open else 'closed'}"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj    