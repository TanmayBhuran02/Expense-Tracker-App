from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from ..extensions import db, limiter
from ..models.user import User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
limiter.limit("20 per minute")(auth_bp)

@auth_bp.route("/register", methods=["POST"])
def register():
    """Register a new user account."""
    data = request.get_json()
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409
    user = User(email=data["email"])
    user.set_password(data["password"])
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token}), 201

@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate user credentials and return an access token."""
    data = request.get_json()
    user = User.query.filter_by(email=data["email"]).first()
    if not user or not user.check_password(data["password"]):
        return jsonify({"error": "Invalid credentials"}), 401
    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token}), 200

@auth_bp.route("/refresh", methods=["POST"])
@jwt_required()
def refresh():
    """Refresh the access token for the authenticated user."""
    current_user_id = get_jwt_identity()
    new_token = create_access_token(identity=current_user_id)
    return jsonify({"access_token": new_token}), 200
