"""
Django settings — CompEng Class Portal (API-only, Vercel + Render)

Local dev:   SQLite, Vite proxies /api → 127.0.0.1:8000 (no CORS needed)
Production:  Postgres via DATABASE_URL, CORS allows the Vercel frontend
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
        "  Local:      set it in backend/.env\n"
        "  Production: set it as an environment variable on Render\n"
    )

DEBUG = os.environ.get("DEBUG", "0") == "1"

# ── ALLOWED_HOSTS ────────────────────────────────────────────
ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")
    if h.strip()
]
# Render injects RENDER_EXTERNAL_HOSTNAME on every deploy.
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
]

# ── Middleware ───────────────────────────────────────────────
# Order matters:
#  1. CorsMiddleware       — must be above CommonMiddleware so CORS
#                            headers are attached to redirects/errors
#  2. SecurityMiddleware   — HTTPS redirect, HSTS
#  3. WhiteNoiseMiddleware — serve admin static files before hits Django
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
# DATABASE_URL is set by Render's Postgres → uses Postgres.
# Otherwise → SQLite for local dev.
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

# ⚠️ Render free tier has an ephemeral filesystem.
# Uploaded files (resources, avatars, audio) are LOST on redeploy or
# restart. For persistent storage, mount a Render Disk at MEDIA_ROOT,
# or migrate to external storage (AWS S3, Cloudflare R2, Cloudinary).
# The Render Disk setting for this project:
#   Name: media, Mount Path: /app/backend/media, Size: 1 GB

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
# The Vercel frontend is on a different origin from this API, so CORS
# must be configured. Token auth via the Authorization header means we
# never send cookies cross-origin → CORS_ALLOW_CREDENTIALS stays False.
#
# Add your actual Vercel URL via the CORS_ALLOWED_ORIGINS env var on
# Render — do NOT hardcode it here.
CORS_ALLOW_CREDENTIALS = False

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

# Vercel preview deployments — every PR gets a unique *.vercel.app URL.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://.*\.vercel\.app$",
]

# ── Upload limits ────────────────────────────────────────────
FILE_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024     # 50 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 50 * 1024 * 1024

# ── App-level ────────────────────────────────────────────────
CLASS_ACCESS_CODE = os.environ.get("CLASS_ACCESS_CODE", "change-me")

# ── Static file storage (WhiteNoise) ─────────────────────────
# Django 4.2+ prefers STORAGES over the deprecated STATICFILES_STORAGE.
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
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

    # A shared cache sitting in front of the API must vary by Origin,
    # or a request from one origin gets a cached response meant for
    # another — which breaks CORS silently.
    CORS_ALLOW_HEADERS = [
        "accept",
        "authorization",
        "content-type",
        "user-agent",
        "x-csrftoken",
        "x-requested-with",
    ] 