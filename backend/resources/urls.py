from django.urls import path

from .views import (
    ResourceDetailView,
    ResourceDownloadView,
    ResourceListCreateView,
    ResourceReviewView,
    ResourceVersionCreateView,
    ResourceVersionDownloadView,
    ResourceVersionListView,
    ResourceViewerView,
)

urlpatterns = [
    # Version routes first — more specific paths win
    path("<int:pk>/versions/", ResourceVersionListView.as_view()),
    path("versions/upload/<int:pk>/", ResourceVersionCreateView.as_view()),
    path("versions/<int:version_pk>/download/", ResourceVersionDownloadView.as_view()),

    path("", ResourceListCreateView.as_view()),
    path("<int:pk>/", ResourceDetailView.as_view()),
    path("<int:pk>/download/", ResourceDownloadView.as_view()),
    path("<int:pk>/view/", ResourceViewerView.as_view()),        # ← the missing route
    path("<int:pk>/review/", ResourceReviewView.as_view()),
] 