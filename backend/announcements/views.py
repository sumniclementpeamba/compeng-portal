import mimetypes
import os

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.notifications import notify_all_except
from accounts.permissions import CanReview
from .models import Announcement
from .serializers import AnnouncementSerializer


class AnnouncementListCreateView(generics.ListCreateAPIView):
    queryset = Announcement.objects.select_related("author")
    serializer_class = AnnouncementSerializer
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_permissions(self):
        if self.request.method == "POST":
            return [CanReview()]
        return super().get_permissions()

    def perform_create(self, serializer):
        a = serializer.save(author=self.request.user)

        # Notify every class member except the author.
        notify_all_except(
            self.request.user,
            kind="announcement",
            title=f"New announcement: {a.title}",
            body=(a.body or "")[:180],
            link="/announcements",
        )


class AnnouncementAudioView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request, pk):
        user = request.user if getattr(request.user, "is_authenticated", False) else None
        if not user:
            token_key = request.query_params.get("token")
            if token_key:
                try:
                    user = Token.objects.select_related("user").get(key=token_key).user
                except Token.DoesNotExist:
                    pass
        if not user:
            return Response({"detail": "Authentication required."}, status=401)

        a = get_object_or_404(Announcement, pk=pk)
        if not a.audio:
            return Response({"detail": "No audio for this announcement."}, status=404)

        mime, _ = mimetypes.guess_type(a.audio.name)
        f = a.audio.open("rb")
        return FileResponse(
            f,
            as_attachment=False,
            filename=os.path.basename(a.audio.name),
            content_type=mime or "audio/mpeg",
        ) 