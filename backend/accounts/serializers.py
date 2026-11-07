from rest_framework import serializers

from .models import Notification, User


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    is_class_rep = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'reference_number', 'first_name', 'email',
            'phone_number', 'index_number', 'level', 'avatar',
            'avatar_url', 'role', 'is_class_rep', 'display_name',
        ]
        read_only_fields = ['id', 'username', 'reference_number']

    def get_display_name(self, obj):
        return obj.first_name or obj.username

    def get_avatar_url(self, obj):
        # Use the model's `avatar_url` property if it exists — that's what
        # produces the correct R2 URL. Falls back to obj.avatar.url only
        # when the model has no property.
        if hasattr(obj, 'avatar_url'):
            return obj.avatar_url
        if not obj.avatar:
            return None
        try:
            return obj.avatar.url
        except (ValueError, AttributeError):
            return None

    def get_role(self, obj):
        from accounts.permissions import role_of
        return role_of(obj)

    def get_is_class_rep(self, obj):
        from accounts.permissions import role_of
        return role_of(obj) == 'rep'


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = [
            'username', 'reference_number', 'first_name', 'email',
            'phone_number', 'index_number', 'level', 'password',
        ]

    def create(self, validated_data):
        password = validated_data.pop('password', None) or 'compeng-2026'
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class MemberListSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    joined_at = serializers.DateTimeField(read_only=True)
    uploads_count = serializers.IntegerField(read_only=True)
    pending_count = serializers.IntegerField(read_only=True)

    # ── Face enrollment ──────────────────────────────────────
    face_enrolled = serializers.SerializerMethodField()
    face_enrolled_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'reference_number', 'first_name', 'email',
            'phone_number', 'index_number', 'level',
            'display_name', 'role', 'avatar_url', 'joined_at',
            'uploads_count', 'pending_count',
            'face_enrolled', 'face_enrolled_at',
        ]

    def get_display_name(self, obj):
        return obj.first_name or obj.username

    def get_role(self, obj):
        from accounts.permissions import role_of
        return role_of(obj)

    def get_avatar_url(self, obj):
        if hasattr(obj, 'avatar_url'):
            return obj.avatar_url
        if not obj.avatar:
            return None
        try:
            return obj.avatar.url
        except (ValueError, AttributeError):
            return None

    def get_joined_at(self, obj):
        m = getattr(obj, 'membership', None)
        return m.joined_at if m else None

    def get_face_enrolled(self, obj):
        return bool(obj.face_embedding)


class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id', 'kind', 'title', 'body', 'link', 'is_read',
            'created_at', 'actor_name',
        ]

    def get_actor_name(self, obj):
        if not obj.actor:
            return None
        return obj.actor.first_name or obj.actor.username 