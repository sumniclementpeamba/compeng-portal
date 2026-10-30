"""
Django settings — CompEng Class Portal
Local: SQLite + .env  ·  Production: Postgres via DATABASE_URL + Render env vars
"""
import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

# ── Paths ────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
PROJECT_ROOT = BASE_DIR.parent                             # project root

_ENV_CANDIDATES = [BASE_DIR / ".env", PROJECT_ROOT / ".env"]
ENV_FILE = next((p for p in _ENV_CANDIDATES if p.exists()), None)
if ENV_FILE:
    load_dotenv(ENV_FILE)

# ── Security ─────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SECRET_KEY", "").strip()
if not SECRET_KEY:
    raise RuntimeError(
        "\n\n  SECRET_KEY missing.\n"
        "  Local:      set in backend/.env\n"
        "  Production: set as env var on Render\n"
    )

DEBUG = os.environ.get("DEBUG", "0") == "1"

# ── Hosts ────────────────────────────────────────────────────
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]
# Render injects RENDER_EXTERNAL_HOSTNAME automatically
_render_host = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if _render_host:
    ALLOWED_HOSTS.append(_render_host)
ALLOWED_HOSTS += ["healthcheck.railway.app", ".onrender.com", ".up.railway.app"]

# ── CSRF ─────────────────────────────────────────────────────
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]
if _render_host:
    CSRF_TRUSTED_ORIGINS.append(f"https://{_render_host}")

# ── Apps ─────────────────────────────────────────────────────
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",

    "accounts",
    "resources",
    "announcements",
    "audit",
    "attendance",
]

# ── Middleware ───────────────────────────────────────────────
# Order:
#   1. CorsMiddleware       — above CommonMiddleware so CORS headers
#                             attach to redirects and errors too
#   2. SecurityMiddleware   — HTTPS redirect, HSTS
#   3. WhiteNoiseMiddleware — serves /static/ (admin CSS, DRF styles)
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

# ── Templates ────────────────────────────────────────────────
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# ── Database ─────────────────────────────────────────────────
# Production: DATABASE_URL from Render Postgres plugin
# Local: falls back to SQLite at backend/db.sqlite3
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# ── Auth ─────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── i18n ─────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ── Static & media ───────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# WhiteNoise: compress + cache-bust static files (Django 5.x/6.x syntax)
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ── DRF ──────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {"user": "120/min"},
}

# ── CORS ─────────────────────────────────────────────────────
# Token auth (Authorization header) → no cookies cross-origin.
# Vercel preview regex handles every preview deployment automatically.
CORS_ALLOW_CREDENTIALS = False

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.vercel\.app$",
]

# ── Upload limits ────────────────────────────────────────────
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024     # 50 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024

# ── App-level ────────────────────────────────────────────────
CLASS_ACCESS_CODE = os.environ.get("CLASS_ACCESS_CODE", "compeng-2025")
GENERAL_PASSWORD = os.environ.get("GENERAL_PASSWORD", "compeng-2026")

# ── Semester configuration ───────────────────────────────────
# Update at the start of each semester.
SEMESTER_CONFIG = {
    "name": "2026/2027 — Semester 1",
    "periods": [
        {"label": "Term 1", "start": "2026-10-26", "end": "2026-12-18"},
        {"label": "Term 2", "start": "2027-01-05", "end": "2027-01-29"},
    ],
    "excluded_dates": [
        "2026-10-26",
        "2026-10-27",
        "2026-10-28",
        "2026-10-29",
    ],
    "holidays": [],
}

# ── Production hardening ─────────────────────────────────────
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

    # Shared caches must vary by Origin or CORS breaks
    CORS_ALLOW_HEADERS = [
        "accept",
        "authorization",
        "content-type",
        "user-agent",
        "x-csrftoken",
        "x-requested-with",
    ] 