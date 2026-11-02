import re

from rest_framework import serializers
from django.utils.text import slugify

from .models import ClassMembership, Notification, User
from .permissions import role_of


MAX_AVATAR_BYTES = 2 * 1024 * 1024
ALLOWED_AVATAR_MIMES = {
    "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
}


class RegisterSerializer(serializers.Serializer):
    """Admin-only use — creates accounts outside the CSV flow."""

    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_full_name(self, value):
        value = " ".join(value.split()).strip()
        if len(value) < 2:
            raise serializers.ValidationError("Full name is too short.")
        if User.objects.filter(first_name__iexact=value).exists():
            raise serializers.ValidationError(
                "A student with this full name already exists."
            )
        return value

    def create(self, validated_data):
        full_name = validated_data["full_name"]
        base_username = slugify(full_name) or "student"
        username = base_username
        counter = 1
        while User.objects.filter(username=username).exists():
            counter += 1
            username = f"{base_username}-{counter}"

        user = User(username=username, first_name=full_name)
        user.set_password(validated_data["password"])
        user.save()
        ClassMembership.objects.create(
            user=user, role=ClassMembership.ROLE_STUDENT,
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    membership_role = serializers.SerializerMethodField()
    is_class_rep = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "username", "display_name", "first_name", "last_name",
            "email", "level", "role", "membership_role", "is_class_rep",
            "avatar", "avatar_url", "reference_number", "phone_number",
            "index_number",
        )
        read_only_fields = (
            "id", "username", "role", "membership_role", "is_class_rep",
            "display_name", "avatar_url", "last_name",
            "reference_number",
            # phone_number — NOT read-only: students can update their own contact
        )
        extra_kwargs = {
            "avatar": {"write_only": True, "required": False},
            "email": {"required": False, "allow_blank": True},
            "level": {"required": False, "allow_blank": True},
            "index_number": {"required": False, "allow_blank": True},
            "phone_number": {"required": False, "allow_blank": True},
        }

    def get_role(self, obj):
        return role_of(obj)

    def get_membership_role(self, obj):
        m = getattr(obj, "membership", None)
        return m.role if m else "student"

    def get_is_class_rep(self, obj):
        m = getattr(obj, "membership", None)
        return bool(m and m.role == "rep")

    def get_display_name(self, obj):
        return obj.first_name or obj.username

    def get_avatar_url(self, obj):
        return "/api/me/avatar/" if obj.avatar else None

    def validate_first_name(self, value):
        if not value:
            return value
        value = " ".join(value.split()).strip()
        if len(value) < 2:
            raise serializers.ValidationError("Full name is too short.")
        qs = User.objects.filter(first_name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                "A student with this full name already exists."
            )
        return value

    def validate_phone_number(self, value):
        if not value:
            return value
        value = value.strip()
        if len(value) > 30:
            raise serializers.ValidationError(
                "Phone number must be 30 characters or fewer."
            )
        if not re.match(r"^[0-9+\-\s()]+$", value):
            raise serializers.ValidationError(
                "Phone number may only contain digits, spaces, +, -, ( and )."
            )
        return value

    def validate_avatar(self, f):
        if not f:
            return f
        if f.size > MAX_AVATAR_BYTES:
            raise serializers.ValidationError("Avatar must be under 2 MB.")
        ct = (f.content_type or "").split(";")[0].strip().lower()
        if ct and ct not in ALLOWED_AVATAR_MIMES:
            raise serializers.ValidationError(
                f"Image format '{ct}' not supported. Use PNG, JPG, WEBP, or GIF."
            )
        return f


class MemberListSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    membership_role = serializers.SerializerMethodField()
    is_class_rep = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    joined_at = serializers.SerializerMethodField()
    uploads_count = serializers.IntegerField(read_only=True, default=0)
    pending_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = User
        fields = (
            "id", "username", "display_name", "first_name",
            "reference_number", "phone_number", "index_number",
            "email", "level", "role", "membership_role", "is_class_rep",
            "avatar_url", "joined_at", "uploads_count", "pending_count",
        )

    def get_role(self, obj):
        return role_of(obj)

    def get_membership_role(self, obj):
        m = getattr(obj, "membership", None)
        return m.role if m else "student"

    def get_is_class_rep(self, obj):
        m = getattr(obj, "membership", None)
        return bool(m and m.role == "rep")

    def get_display_name(self, obj):
        return obj.first_name or obj.username

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None
        return f"/api/members/{obj.pk}/avatar/"

    def get_joined_at(self, obj):
        m = getattr(obj, "membership", None)
        return m.joined_at if m else None


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            "id", "kind", "title", "body", "link",
            "is_read", "created_at", "actor", "actor_name",
        )
        read_only_fields = fields

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        return obj.actor.first_name or obj.actor.username 