import os
import logging
import time
from flask import Flask, jsonify, request as flask_request, g
from werkzeug.exceptions import HTTPException
from .config import Config
from .extensions import db, migrate, jwt, cors, limiter

def create_app():
    """Create and configure the Flask application instance."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # ── Logging setup ────────────────────────────────────────────────────────
    # Ensure Flask logger outputs at DEBUG level in dev
    if not os.environ.get("FLASK_ENV") == "production":
        app.logger.setLevel(logging.DEBUG)
        logging.getLogger("werkzeug").setLevel(logging.INFO)

    # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    
    # CORS: credentials mode requires explicit origins (not "*")
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    allowed_origins = [origin.strip() for origin in frontend_url.split(",")]

    if os.environ.get("FLASK_ENV") == "production":
        cors.init_app(app, resources={r"/api/*": {
            "origins": allowed_origins,
            "supports_credentials": True,
        }})
    else:
        # In dev, allow any origin for LAN/localhost flexibility
        cors.init_app(app, resources={r"/api/*": {
            "origins": r".*",
            "supports_credentials": True,
        }})

    # Register blueprints
    from .api import register_blueprints
    register_blueprints(app)

    # ── Request lifecycle logging ────────────────────────────────────────────

    @app.before_request
    def log_request_start():
        """Record request start time for duration calculation."""
        g.request_start_time = time.time()

    @app.after_request
    def log_request_info(response):
        """Log every request with method, path, status, and duration."""
        duration_ms = (time.time() - getattr(g, "request_start_time", time.time())) * 1000
        status = response.status_code
        # Color-code by status range
        if status >= 500:
            app.logger.error("%-6s %s → %d (%.1fms)", flask_request.method, flask_request.path, status, duration_ms)
        elif status >= 400:
            app.logger.warning("%-6s %s → %d (%.1fms)", flask_request.method, flask_request.path, status, duration_ms)
        else:
            app.logger.info("%-6s %s → %d (%.1fms)", flask_request.method, flask_request.path, status, duration_ms)
        return response

    # ── Error handlers ───────────────────────────────────────────────────────

    @app.errorhandler(Exception)
    def handle_exception(e):
        """Global error handler returning JSON for every non-2xx response."""
        if isinstance(e, HTTPException):
            app.logger.warning("HTTP %d on %s %s: %s", e.code, flask_request.method, flask_request.path, e.description)
            return jsonify({"error": e.description}), e.code
        app.logger.exception("Unhandled server exception on %s %s", flask_request.method, flask_request.path)
        return jsonify({"error": "Internal Server Error"}), 500

    # ── JWT error callbacks (log auth failures) ──────────────────────────────

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        app.logger.warning("Expired JWT on %s %s (sub=%s)", flask_request.method, flask_request.path, jwt_payload.get("sub"))
        return jsonify({"error": "Token has expired"}), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error_msg):
        app.logger.warning("Invalid JWT on %s %s: %s", flask_request.method, flask_request.path, error_msg)
        return jsonify({"error": "Invalid token"}), 401

    @jwt.unauthorized_loader
    def missing_token_callback(error_msg):
        app.logger.warning("Missing JWT on %s %s: %s", flask_request.method, flask_request.path, error_msg)
        return jsonify({"error": "Authorization required"}), 401

    return app
