from flask import Flask
from .config import Config
from .extensions import db, migrate, jwt, cors

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Init extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    # Allow all origins in dev; restrict to your domain in prod via CORS(app, origins=[...])
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}})

    # Register blueprints
    from .api import register_blueprints
    register_blueprints(app)

    return app
