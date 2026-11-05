from django.urls import path
from . import views as account_views
from .views import LoginView, RegisterView

urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path('me/face/status/', account_views.face_status, name='face-status'),
    path('me/face/enroll/', account_views.face_enroll, name='face-enroll'),
    path('me/face/', account_views.face_delete, name='face-delete'),
]