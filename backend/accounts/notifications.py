from .models import Notification, User


def create_notification(*, user, kind, title, body="", link="", actor=None):
    """Create a single notification for one user."""
    return Notification.objects.create(
        user=user,
        kind=kind,
        title=title,
        body=body,
        link=link,
        actor=actor,
    )


def notify_all_except(actor, *, kind, title, body="", link=""):
    """Create one notification per user, excluding the actor.

    Uses bulk_create for one INSERT per recipient-count — fast even for
    a class of 50+ members.
    """
    recipients = User.objects.exclude(pk=actor.pk).values_list("pk", flat=True)
    Notification.objects.bulk_create([
        Notification(
            user_id=uid,
            kind=kind,
            title=title,
            body=body,
            link=link,
            actor=actor,
        )
        for uid in recipients
    ]) 