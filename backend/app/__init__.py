import os
from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException
from .config import Config
from .extensions import db, migrate, jwt, cors, limiter

def create_app():
    """Create and configure the Flask application instance."""
    app = Flask(__name__)
    app.config.from_object(Config)

    # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    
    # Allow all origins in dev; restrict to your domain in prod
    frontend_url = os.environ.get("FRONTEND_URL")
    if frontend_url and os.environ.get("FLASK_ENV") == "production":
        cors.init_app(app, resources={r"/api/*": {"origins": [frontend_url]}})
    else:
        cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    # Register blueprints
    from .api import register_blueprints
    register_blueprints(app)

    @app.errorhandler(Exception)
    def handle_exception(e):
        """Global error handler returning JSON for every non-2xx response."""
        if isinstance(e, HTTPException):
            return jsonify({"error": e.description}), e.code
        app.logger.exception("Unhandled server exception")
        return jsonify({"error": "Internal Server Error"}), 500

    return app
