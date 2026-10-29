from rest_framework import serializers

from .models import Announcement

MAX_AUDIO_BYTES = 10 * 1024 * 1024   # 10 MB

# Browsers may send content types with codec params, e.g.
# "audio/webm;codecs=opus" — we strip params before checking.
ALLOWED_AUDIO_MIMES = {
    "audio/webm",
    "audio/ogg",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/x-m4a",
    "audio/m4a",
}


class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = (
            "id", "title", "body", "course_name", "pinned",
            "expires_at", "author", "author_name", "created_at",
            "audio", "audio_url",
        )
        read_only_fields = ("author", "created_at", "audio_url")
        extra_kwargs = {
            "audio": {"write_only": True, "required": False},
        }

    def get_audio_url(self, obj):
        if not obj.audio:
            return None
        return f"/api/announcements/{obj.pk}/audio/"

    def validate_audio(self, f):
        if not f:
            return f
        if f.size > MAX_AUDIO_BYTES:
            raise serializers.ValidationError(
                "Audio file exceeds the 10 MB limit."
            )
        ct = (f.content_type or "").split(";")[0].strip().lower()
        if ct and ct not in ALLOWED_AUDIO_MIMES:
            raise serializers.ValidationError(
                f"Audio format '{ct}' is not supported."
            )
        return f 