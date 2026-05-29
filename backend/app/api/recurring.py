import uuid
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models.recurring_rule import RecurringRule

recurring_bp = Blueprint("recurring", __name__, url_prefix="/api/recurring-rules")

VALID_FREQUENCIES = {"daily", "weekly", "monthly", "yearly"}


@recurring_bp.route("/", methods=["GET"])
@jwt_required()
def list_rules():
    """List all active recurring rules for the authenticated user."""
    user_id = get_jwt_identity()
    rules = RecurringRule.query.filter_by(user_id=user_id, is_active=True)\
        .order_by(RecurringRule.next_due).all()
    return jsonify([r.to_dict() for r in rules]), 200


@recurring_bp.route("/", methods=["POST"])
@jwt_required()
def create_rule():
    """Create a new recurring rule."""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing request body"}), 400

    title = data.get("title", "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400

    amount = data.get("amount")
    if amount is None or float(amount) <= 0:
        return jsonify({"error": "Amount must be greater than 0"}), 400

    frequency = data.get("frequency")
    if frequency not in VALID_FREQUENCIES:
        return jsonify({"error": f"Frequency must be one of: {', '.join(sorted(VALID_FREQUENCIES))}"}), 400

    start_date = data.get("start_date")
    if not start_date:
        return jsonify({"error": "start_date is required"}), 400

    rule = RecurringRule(
        id=uuid.UUID(data["id"]) if data.get("id") else uuid.uuid4(),
        user_id=user_id,
        title=title,
        amount=float(amount),
        category=data.get("category"),
        frequency=frequency,
        start_date=start_date,
        next_due=data.get("next_due", start_date),
        end_date=data.get("end_date"),
        is_active=True,
    )

    db.session.add(rule)
    db.session.commit()
    return jsonify(rule.to_dict()), 201


@recurring_bp.route("/<rule_id>", methods=["PATCH"])
@jwt_required()
def update_rule(rule_id):
    """Update an existing recurring rule (pause, edit, etc.)."""
    user_id = get_jwt_identity()

    try:
        rid = uuid.UUID(rule_id)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid rule ID"}), 400

    rule = RecurringRule.query.filter_by(id=rid, user_id=user_id).first()
    if not rule:
        return jsonify({"error": "Rule not found"}), 404

    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing request body"}), 400

    # Allow partial updates on whitelisted fields
    if "title" in data:
        rule.title = data["title"]
    if "amount" in data:
        rule.amount = float(data["amount"])
    if "category" in data:
        rule.category = data["category"]
    if "frequency" in data:
        if data["frequency"] not in VALID_FREQUENCIES:
            return jsonify({"error": f"Frequency must be one of: {', '.join(sorted(VALID_FREQUENCIES))}"}), 400
        rule.frequency = data["frequency"]
    if "next_due" in data:
        rule.next_due = data["next_due"]
    if "end_date" in data:
        rule.end_date = data["end_date"]
    if "is_active" in data:
        rule.is_active = data["is_active"]

    db.session.commit()
    return jsonify(rule.to_dict()), 200


@recurring_bp.route("/<rule_id>", methods=["DELETE"])
@jwt_required()
def delete_rule(rule_id):
    """Soft-delete a recurring rule by setting is_active = False."""
    user_id = get_jwt_identity()

    try:
        rid = uuid.UUID(rule_id)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid rule ID"}), 400

    rule = RecurringRule.query.filter_by(id=rid, user_id=user_id).first()
    if not rule:
        return jsonify({"error": "Rule not found"}), 404

    rule.is_active = False
    db.session.commit()
    return jsonify({"message": "Rule deactivated"}), 200
