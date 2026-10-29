from rest_framework import generics

from accounts.permissions import CanReview
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [CanReview]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("actor").all()

        action = self.request.query_params.get("action")
        if action:
            qs = qs.filter(action=action)

        target_type = self.request.query_params.get("target_type")
        if target_type:
            qs = qs.filter(target_type=target_type)

        return qs 