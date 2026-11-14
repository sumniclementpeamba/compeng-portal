from django.db import migrations, models


def backfill_flags(apps, schema_editor):
    """
    Superusers, reps, and admins never see the 'Set up password' prompt.
    Only students go through personal-password setup.
    """
    User = apps.get_model('accounts', 'User')
    ClassMembership = apps.get_model('accounts', 'ClassMembership')

    User.objects.filter(is_superuser=True).update(
        is_using_class_password=False
    )

    privileged_ids = list(
        ClassMembership.objects
        .filter(role__in=['rep', 'admin'])
        .values_list('user_id', flat=True)
    )
    if privileged_ids:
        User.objects.filter(pk__in=privileged_ids).update(
            is_using_class_password=False
        )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0007_faceenrollmentsetting'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_using_class_password',
            field=models.BooleanField(
                default=True,
                help_text=(
                    "True while the user still logs in with the shared class "
                    "password. Cleared when the student sets a personal "
                    "password from Profile. Admins and reps are exempt via "
                    "data migration."
                ),
            ),
        ),
        migrations.RunPython(backfill_flags, migrations.RunPython.noop),
    ] 