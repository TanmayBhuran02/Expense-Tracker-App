from .auth import auth_bp
from .sync import sync_bp

def register_blueprints(app):
    app.register_blueprint(auth_bp)
    app.register_blueprint(sync_bp)
