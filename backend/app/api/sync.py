from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime, timezone
from ..extensions import db
from ..models.transaction import Transaction

sync_bp = Blueprint("sync", __name__, url_prefix="/api")

@sync_bp.route("/sync", methods=["POST"])
@jwt_required()
def sync():
    """
    Bidirectional sync endpoint.

    Request body:
        {
          "last_sync_timestamp": "<ISO8601 string or null>",
          "transactions": [ { client_uuid, amount, type, category, timestamp }, ... ]
        }

    Response:
        {
          "synced_count": <int>,            -- how many records were upserted
          "server_transactions": [ ... ],   -- records newer than last_sync_timestamp
          "server_timestamp": "<ISO8601>"   -- client should store this as new last_sync_timestamp
        }

    Conflict resolution strategy: LAST-WRITE-WINS via upsert on (user_id, client_uuid).
    The client_uuid is stable per logical transaction, so retrying sync is idempotent.
    """
    user_id = get_jwt_identity()
    body    = request.get_json()

    incoming      = body.get("transactions", [])
    last_sync_ts  = body.get("last_sync_timestamp")   # ISO string or null

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
            }
            for t in incoming
        ])
        # On conflict, update mutable fields. updated_at is handled by the DB trigger.
        stmt = stmt.on_conflict_do_update(
            constraint="uq_user_client_uuid",
            set_={
                "amount":    stmt.excluded.amount,
                "type":      stmt.excluded.type,
                "category":  stmt.excluded.category,
                "timestamp": stmt.excluded.timestamp,
            }
        )
        db.session.execute(stmt)
        db.session.commit()

    # ── PULL: return everything the client hasn't seen yet ──────────────────
    query = Transaction.query.filter_by(user_id=user_id)
    if last_sync_ts:
        since = datetime.fromisoformat(last_sync_ts).replace(tzinfo=timezone.utc)
        query = query.filter(Transaction.updated_at > since)

    server_txns = [t.to_dict() for t in query.order_by(Transaction.updated_at).all()]

    return jsonify({
        "synced_count":       len(incoming),
        "server_transactions": server_txns,
        "server_timestamp":   datetime.now(timezone.utc).isoformat(),
    }), 200
