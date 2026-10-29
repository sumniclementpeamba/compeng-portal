from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            "id", "actor", "actor_name", "action",
            "target_type", "target_id", "details", "created_at",
        )

    def get_actor_name(self, obj):
        if not obj.actor:
            return "system"
        return obj.actor.first_name or obj.actor.username