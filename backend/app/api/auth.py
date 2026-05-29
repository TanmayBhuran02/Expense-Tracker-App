import re
from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
    set_access_cookies,
    unset_jwt_cookies,
)
from ..extensions import db, limiter
from ..models.user import User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
limiter.limit("20 per minute")(auth_bp)

# ── Validation helpers ───────────────────────────────────────────────────────

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

def _validate_auth_payload(data):
    """Validate common auth fields. Returns (email, password, error_response)."""
    if not data:
        return None, None, (jsonify({"error": "Missing request body"}), 400)

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email:
        return None, None, (jsonify({"error": "Email is required"}), 400)
    if not EMAIL_RE.match(email):
        return None, None, (jsonify({"error": "Invalid email format"}), 400)
    if not password:
        return None, None, (jsonify({"error": "Password is required"}), 400)
    if len(password) < 8:
        return None, None, (jsonify({"error": "Password must be at least 8 characters"}), 400)

    return email, password, None


# ── Register ─────────────────────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
def register():
    """Register a new user account. Sets JWT as httpOnly cookie."""
    email, password, err = _validate_auth_payload(request.get_json(silent=True))
    if err:
        return err

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(email=email)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    response = make_response(jsonify({"message": "Registration successful", "user_id": user.id}), 201)
    set_access_cookies(response, token)
    return response


# ── Login ────────────────────────────────────────────────────────────────────

@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate user credentials. Sets JWT as httpOnly cookie."""
    email, password, err = _validate_auth_payload(request.get_json(silent=True))
    if err:
        return err

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=str(user.id))
    response = make_response(jsonify({"message": "Login successful", "user_id": user.id}), 200)
    set_access_cookies(response, token)
    return response


# ── Refresh ──────────────────────────────────────────────────────────────────

@auth_bp.route("/refresh", methods=["POST"])
@jwt_required()
def refresh():
    """Refresh the access token for the authenticated user. Sets new httpOnly cookie."""
    current_user_id = get_jwt_identity()
    new_token = create_access_token(identity=current_user_id)
    response = make_response(jsonify({"message": "Token refreshed"}), 200)
    set_access_cookies(response, new_token)
    return response


# ── Me (auth status check) ───────────────────────────────────────────────────

@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Check if the current session cookie is valid. Returns user info."""
    current_user_id = get_jwt_identity()
    return jsonify({"authenticated": True, "user_id": int(current_user_id)}), 200


# ── Logout ───────────────────────────────────────────────────────────────────

@auth_bp.route("/logout", methods=["POST"])
def logout():
    """Clear the httpOnly JWT cookies server-side."""
    response = make_response(jsonify({"message": "Logged out"}), 200)
    unset_jwt_cookies(response)
    return response
