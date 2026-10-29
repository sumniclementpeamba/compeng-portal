from django.urls import path

from .views import AnnouncementAudioView, AnnouncementListCreateView

urlpatterns = [
    path("", AnnouncementListCreateView.as_view()),
    path("<int:pk>/audio/", AnnouncementAudioView.as_view()),
] 