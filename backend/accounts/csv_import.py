"""
Import class members from a CSV file.

Expected format — three columns, this order:
    Reference number | Name | Number

Example row:
    UA2600133,Adaeze Okonkwo,0244123456

Reference numbers are 9 characters (see REFERENCE_NUMBER_MAX_LEN in
models.py). Longer references are rejected per row.

Header row is optional. If the first row's cells contain words like
"reference", "name", "number", or "phone", it's treated as a header
and skipped. Otherwise the first row is treated as data.

Columns beyond index 2 are ignored.
"""
import csv
import hashlib
import io
import re

from django.utils.text import slugify

from .models import (
    ClassMembership,
    REFERENCE_NUMBER_MAX_LEN,
    User,
)


HEADER_KEYWORDS = ("ref", "name", "num", "phone")


def ref_to_username(ref: str) -> str:
    """Turn 'UA2600133' into 'ua2600133' for the Django username field."""
    cleaned = (ref or "").strip().upper()
    for sep in ("/", "\\", ".", ",", "|", "_", " "):
        cleaned = cleaned.replace(sep, "-")
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    slug = slugify(cleaned)
    if not slug:
        slug = "ref-" + hashlib.md5(ref.encode()).hexdigest()[:8]
    return slug


def _looks_like_header(row: list) -> bool:
    for cell in row:
        c = (cell or "").strip().lower()
        if not c:
            continue
        if any(kw in c for kw in HEADER_KEYWORDS):
            return True
    return False


def create_or_update_member(reference: str, name: str, number: str, password: str):
    """Idempotent: matches on reference_number, creates or updates."""
    ref = (reference or "").strip()
    if not ref:
        raise ValueError("reference number is empty")
    if len(ref) > REFERENCE_NUMBER_MAX_LEN:
        raise ValueError(
            f"reference '{ref}' is {len(ref)} chars "
            f"(max {REFERENCE_NUMBER_MAX_LEN})"
        )

    existing = User.objects.filter(reference_number__iexact=ref).first()

    if existing:
        if existing.is_superuser or existing.is_staff:
            raise ValueError(f"'{ref}' collides with an admin account — skipped")
        updates = {}
        if name and existing.first_name != name:
            updates["first_name"] = name
        if number and existing.phone_number != number:
            updates["phone_number"] = number
        if updates:
            for k, v in updates.items():
                setattr(existing, k, v)
            existing.save(update_fields=list(updates.keys()))
        return "updated", existing

    # New user
    base_username = ref_to_username(ref)
    username = base_username
    counter = 1
    while User.objects.filter(username=username).exists():
        counter += 1
        username = f"{base_username}-{counter}"

    user = User(
        username=username,
        first_name=name or ref,
        phone_number=number or "",
        reference_number=ref,
    )
    user.set_password(password)
    user.save()
    ClassMembership.objects.create(user=user, role=ClassMembership.ROLE_STUDENT)
    return "created", user


def import_members_from_csv(file_obj, password: str) -> dict:
    """Parse the uploaded CSV, create/update users. Returns a summary dict."""
    raw = file_obj.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("latin-1")
        except Exception as e:
            raise ValueError(f"Cannot decode CSV: {e}")

    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any((c or "").strip() for c in r)]
    if not rows:
        raise ValueError("CSV is empty")

    has_header = _looks_like_header(rows[0])
    data_rows = rows[1:] if has_header else rows

    created = 0
    updated = 0
    errors: list = []
    seen_refs: set = set()

    for line_num, row in enumerate(data_rows, start=2 if has_header else 1):
        def cell(idx):
            return (row[idx] or "").strip() if idx < len(row) else ""

        ref = cell(0)
        name = cell(1)
        number = cell(2)

        if not ref:
            errors.append(f"Row {line_num}: reference number is empty")
            continue

        ref_key = ref.lower()
        if ref_key in seen_refs:
            errors.append(f"Row {line_num}: duplicate reference '{ref}' in CSV")
            continue
        seen_refs.add(ref_key)

        try:
            action, _ = create_or_update_member(ref, name, number, password)
            if action == "created":
                created += 1
            else:
                updated += 1
        except Exception as e:
            errors.append(f"Row {line_num}: {e}")

    return {
        "created": created,
        "updated": updated,
        "total": created + updated,
        "errors": errors,
    } 