from .auth import auth_bp
from .sync import sync_bp
from .recurring import recurring_bp
from .splits import splits_bp

def register_blueprints(app):
    """Register all application API blueprints to the Flask app."""
    app.register_blueprint(auth_bp)
    app.register_blueprint(sync_bp)
    app.register_blueprint(recurring_bp)
    app.register_blueprint(splits_bp)
