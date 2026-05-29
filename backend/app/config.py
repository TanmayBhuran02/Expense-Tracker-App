import os
from datetime import timedelta

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/expense_tracker")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-me-too")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=1)

    # ── Cookie-based JWT configuration ────────────────────────────────────────
    # Read tokens from cookies instead of Authorization headers
    JWT_TOKEN_LOCATION = ["cookies"]

    # httpOnly cookie: JS cannot read the token → eliminates XSS theft vector
    JWT_COOKIE_SECURE = os.environ.get("JWT_COOKIE_SECURE", "false").lower() == "true"  # True in prod (HTTPS)
    JWT_COOKIE_SAMESITE = "Lax"       # Prevents cross-origin cookie sending (CSRF baseline)
    JWT_ACCESS_COOKIE_PATH = "/api"   # Scope cookie to API routes only

    # CSRF double-submit protection (required when using cookies)
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_CSRF_IN_COOKIES = True        # Auto-set a readable csrf_access_token cookie
    JWT_CSRF_CHECK_FORM = False       # We send CSRF via header, not form field
