from django.urls import path

from .views import (
    AttendanceCancelSessionView,
    AttendanceCloseCheckInView,
    AttendanceExportView,
    AttendanceMarkView,
    AttendanceOpenCheckInView,
    AttendanceSelfCheckInView,
    AttendanceSessionDetailView,
    AttendanceSessionListCreateView,
    AttendanceSessionStudentView,
    MyAttendanceView,
    MySemesterAttendanceView,
    SemesterAttendanceSummaryView,
    TimetableEntryDetailView,
    TimetableEntryListCreateView,
)

urlpatterns = [
    # Timetable
    path("timetable/", TimetableEntryListCreateView.as_view()),
    path("timetable/<int:pk>/", TimetableEntryDetailView.as_view()),

    # Sessions
    path("sessions/", AttendanceSessionListCreateView.as_view()),
    path("sessions/<int:pk>/", AttendanceSessionDetailView.as_view()),
    path("sessions/<int:pk>/me/", AttendanceSessionStudentView.as_view()),
    path("sessions/<int:pk>/mark/", AttendanceMarkView.as_view()),
    path("sessions/<int:pk>/open-check-in/", AttendanceOpenCheckInView.as_view()),
    path("sessions/<int:pk>/close-check-in/", AttendanceCloseCheckInView.as_view()),
    path("sessions/<int:pk>/self-check-in/", AttendanceSelfCheckInView.as_view()),
    path("sessions/<int:pk>/cancel/", AttendanceCancelSessionView.as_view()),

    # Student personal view
    path("me/", MyAttendanceView.as_view()),
    path("me/semester/", MySemesterAttendanceView.as_view()),

    # Admin semester view + export
    path("semester/summary/", SemesterAttendanceSummaryView.as_view()),
    path("export/", AttendanceExportView.as_view()),
] 