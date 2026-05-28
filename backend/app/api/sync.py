import uuid
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime, timezone
from ..extensions import db
from ..models.transaction import Transaction

sync_bp = Blueprint("sync", __name__, url_prefix="/api")

# // PLAID_HOOK Plaid webhook handler would be registered or called here

@sync_bp.route("/sync", methods=["POST"])
@jwt_required()
def sync():
    """Perform bidirectional sync of transactions between client and server."""
    user_id = get_jwt_identity()
    body    = request.get_json()
    if not body:
        return jsonify({"error": "Missing request body"}), 400

    incoming      = body.get("transactions", [])
    last_sync_ts  = body.get("last_sync_timestamp")   # ISO string or null

    if not isinstance(incoming, list):
        return jsonify({"error": "transactions field must be a list"}), 400

    # Enforce maximum of 500 transactions per sync payload
    if len(incoming) > 500:
        return jsonify({"error": "Sync payload exceeds limit of 500 transactions"}), 400

    # Validate client_uuid formats
    for t in incoming:
        client_uuid = t.get("client_uuid")
        try:
            uuid.UUID(str(client_uuid), version=4)
        except (ValueError, TypeError, AttributeError):
            return jsonify({"error": f"Invalid client_uuid: {client_uuid}. Must be a valid UUID v4."}), 400

    # ── PUSH: upsert each incoming transaction ──────────────────────────────
    if incoming:
        stmt = pg_insert(Transaction).values([
            {
                "user_id":     user_id,
                "client_uuid": t["client_uuid"],
                "amount":      t["amount"],
                "type":        t["type"],
                "category":    t["category"],
                "timestamp":   datetime.fromisoformat(t["timestamp"]),
                "deleted_at":  datetime.now(timezone.utc) if t.get("deleted") else None,
            }
            for t in incoming
        ])
        # On conflict, update mutable fields. updated_at is handled by the DB trigger.
        stmt = stmt.on_conflict_do_update(
            constraint="uq_user_client_uuid",
            set_={
                "amount":      stmt.excluded.amount,
                "type":        stmt.excluded.type,
                "category":    stmt.excluded.category,
                "timestamp":   stmt.excluded.timestamp,
                "deleted_at":  stmt.excluded.deleted_at,
            }
        )
        db.session.execute(stmt)
        db.session.commit()

    # ── PULL: return everything the client hasn't seen yet ──────────────────
    query = Transaction.query.filter_by(user_id=user_id)
    if last_sync_ts:
        since = datetime.fromisoformat(last_sync_ts).replace(tzinfo=timezone.utc)
        query = query.filter(Transaction.updated_at > since)
    else:
        # For first sync, don't pull soft-deleted items
        query = query.filter(Transaction.deleted_at.is_(None))

    server_txns = [t.to_dict() for t in query.order_by(Transaction.updated_at).all()]

    return jsonify({
        "synced_count":       len(incoming),
        "server_transactions": server_txns,
        "server_timestamp":   datetime.now(timezone.utc).isoformat(),
    }), 200
