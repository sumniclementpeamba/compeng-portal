"""
Semester attendance calculation.

Reads `settings.SEMESTER_CONFIG` to determine which dates count
toward semester attendance, then computes expected/attended totals
per student.
"""
from datetime import date, timedelta

from django.conf import settings


def get_semester_config():
    return getattr(settings, "SEMESTER_CONFIG", None)


def _parse_date(value):
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def semester_date_range(config):
    starts = [_parse_date(p["start"]) for p in config["periods"]]
    ends = [_parse_date(p["end"]) for p in config["periods"]]
    return min(starts), max(ends)


def iter_period_dates(config):
    """Yield every calendar date inside a teaching period (breaks excluded)."""
    for period in config["periods"]:
        start = _parse_date(period["start"])
        end = _parse_date(period["end"])
        d = start
        while d <= end:
            yield d
            d += timedelta(days=1)


def is_excluded(d, config):
    """True if a date should NOT count toward semester attendance."""
    # Weekends
    if d.weekday() >= 5:
        return True
    # Explicit exclusions (the "exhausted" days)
    excluded = {_parse_date(s) for s in config.get("excluded_dates", [])}
    if d in excluded:
        return True
    # Public holidays
    holidays = {_parse_date(s) for s in config.get("holidays", [])}
    if d in holidays:
        return True
    return False


def counted_semester_dates(config, *, upto_today=False):
    """Sorted list of dates that count toward semester attendance.

    If `upto_today=True`, future dates are excluded (useful for
    "attendance so far" metrics).
    """
    today = date.today()
    out = []
    for d in iter_period_dates(config):
        if is_excluded(d, config):
            continue
        if upto_today and d > today:
            continue
        out.append(d)
    return sorted(out)


def _entries_by_weekday():
    """Return {weekday_index: count} across the active timetable."""
    from attendance.models import TimetableEntry

    result = {}
    for entry in TimetableEntry.objects.filter(active=True):
        result[entry.day_of_week] = result.get(entry.day_of_week, 0) + 1
    return result


def expected_sessions_total(config, *, upto_today=False):
    """How many class sessions *should* have happened by now / by end of semester."""
    dates = counted_semester_dates(config, upto_today=upto_today)
    if not dates:
        return 0

    by_dow = _entries_by_weekday()
    if not by_dow:
        return 0

    total = 0
    for d in dates:
        total += by_dow.get(d.weekday(), 0)
    return total


def expected_sessions_by_course(config, *, upto_today=False):
    """Return {course_code: expected_count} for the semester."""
    from attendance.models import TimetableEntry

    dates = counted_semester_dates(config, upto_today=upto_today)
    if not dates:
        return {}

    # {course_code: {weekday_index: count}}
    course_dow = {}
    for entry in TimetableEntry.objects.filter(active=True):
        course_dow.setdefault(entry.course_code, {})
        course_dow[entry.course_code][entry.day_of_week] = (
            course_dow[entry.course_code].get(entry.day_of_week, 0) + 1
        )

    # {weekday_index: count_of_days}
    days_per_dow = {}
    for d in dates:
        days_per_dow[d.weekday()] = days_per_dow.get(d.weekday(), 0) + 1

    result = {}
    for code, dow_counts in course_dow.items():
        total = sum(
            days_per_dow.get(dow, 0) * cnt for dow, cnt in dow_counts.items()
        )
        if total:
            result[code] = total
    return result


def semester_progress(config):
    """How far through the semester are we, as of today?"""
    all_dates = sorted(iter_period_dates(config))
    if not all_dates:
        return {"elapsed_days": 0, "total_days": 0, "percent": 0}

    today = date.today()
    total = len(all_dates)
    elapsed = sum(1 for d in all_dates if d <= today)

    return {
        "elapsed_days": elapsed,
        "total_days": total,
        "percent": round(elapsed / total * 100, 1) if total else 0,
        "start": all_dates[0].isoformat(),
        "end": all_dates[-1].isoformat(),
        "is_active": all_dates[0] <= today <= all_dates[-1],
    }


def build_semester_meta(config):
    start, end = semester_date_range(config)
    return {
        "name": config.get("name", "Semester"),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "periods": config["periods"],
        "excluded_dates": config.get("excluded_dates", []),
        "holidays": config.get("holidays", []),
    }