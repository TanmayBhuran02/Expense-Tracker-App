import uuid
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timezone
from ..extensions import db
from ..models.split import Split, SplitMember

splits_bp = Blueprint("splits", __name__, url_prefix="/api/splits")


@splits_bp.route("/", methods=["GET"])
@jwt_required()
def list_splits():
    """List all splits with their members for the authenticated user."""
    user_id = get_jwt_identity()
    splits = Split.query.filter_by(user_id=user_id)\
        .order_by(Split.created_at.desc()).all()
    return jsonify([s.to_dict() for s in splits]), 200


@splits_bp.route("/", methods=["POST"])
@jwt_required()
def create_split():
    """Create a split with its members in one atomic request."""
    user_id = get_jwt_identity()
    data = request.get_json()

    if not data:
        return jsonify({"error": "Missing request body"}), 400

    title = data.get("title", "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400

    total_amount = data.get("total_amount")
    if total_amount is None or float(total_amount) <= 0:
        return jsonify({"error": "total_amount must be greater than 0"}), 400

    transaction_id = data.get("transaction_id")
    if not transaction_id:
        return jsonify({"error": "transaction_id is required"}), 400

    members_data = data.get("members", [])
    if len(members_data) < 1:
        return jsonify({"error": "At least one member is required"}), 400

    # Validate share amounts sum to total
    share_sum = sum(float(m.get("share_amount", 0)) for m in members_data)
    if abs(share_sum - float(total_amount)) > 0.01:
        return jsonify({"error": f"Sum of shares ({share_sum:.2f}) does not match total ({float(total_amount):.2f})"}), 400

    split = Split(
        id=uuid.UUID(data["id"]) if data.get("id") else uuid.uuid4(),
        user_id=user_id,
        transaction_id=uuid.UUID(transaction_id),
        title=title,
        total_amount=float(total_amount),
    )
    db.session.add(split)

    for m in members_data:
        member = SplitMember(
            id=uuid.UUID(m["id"]) if m.get("id") else uuid.uuid4(),
            split_id=split.id,
            name=m.get("name", "").strip(),
            share_amount=float(m.get("share_amount", 0)),
            is_settled=m.get("is_settled", False),
        )
        db.session.add(member)

    db.session.commit()
    return jsonify(split.to_dict()), 201


@splits_bp.route("/<split_id>/members/<member_id>", methods=["PATCH"])
@jwt_required()
def toggle_settled(split_id, member_id):
    """Toggle the is_settled status of a split member."""
    user_id = get_jwt_identity()

    try:
        sid = uuid.UUID(split_id)
        mid = uuid.UUID(member_id)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid split or member ID"}), 400

    # Verify the split belongs to the user
    split = Split.query.filter_by(id=sid, user_id=user_id).first()
    if not split:
        return jsonify({"error": "Split not found"}), 404

    member = SplitMember.query.filter_by(id=mid, split_id=sid).first()
    if not member:
        return jsonify({"error": "Member not found"}), 404

    data = request.get_json() or {}
    new_settled = data.get("is_settled", not member.is_settled)
    member.is_settled = new_settled
    member.settled_at = datetime.now(timezone.utc) if new_settled else None

    db.session.commit()
    return jsonify(member.to_dict()), 200
