import uuid
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy.dialects.postgresql import insert as pg_insert
from datetime import datetime, timezone
from ..extensions import db
from ..models.transaction import Transaction
from ..models.recurring_rule import RecurringRule
from ..models.split import Split, SplitMember

sync_bp = Blueprint("sync", __name__, url_prefix="/api")

# // PLAID_HOOK Plaid webhook handler would be registered or called here

@sync_bp.route("/sync", methods=["POST"])
@jwt_required()
def sync():
    """Perform bidirectional sync of transactions, recurring rules, and splits between client and server."""
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
                "user_id":           user_id,
                "client_uuid":       t["client_uuid"],
                "amount":            t["amount"],
                "type":              t["type"],
                "category":          t["category"],
                "timestamp":         datetime.fromisoformat(t["timestamp"]),
                "deleted_at":        datetime.now(timezone.utc) if t.get("deleted") else None,
                "recurring_rule_id": uuid.UUID(t["recurring_rule_id"]) if t.get("recurring_rule_id") else None,
            }
            for t in incoming
        ])
        # On conflict, update mutable fields. updated_at is handled by the DB trigger.
        stmt = stmt.on_conflict_do_update(
            constraint="uq_user_client_uuid",
            set_={
                "amount":            stmt.excluded.amount,
                "type":              stmt.excluded.type,
                "category":          stmt.excluded.category,
                "timestamp":         stmt.excluded.timestamp,
                "deleted_at":        stmt.excluded.deleted_at,
                "recurring_rule_id": stmt.excluded.recurring_rule_id,
            }
        )
        db.session.execute(stmt)
        db.session.commit()

    # ── PUSH: upsert recurring rules ────────────────────────────────────────
    incoming_rules = body.get("recurring_rules", [])
    if incoming_rules:
        for r in incoming_rules:
            try:
                rule_id = uuid.UUID(str(r.get("id")))
            except (ValueError, TypeError, AttributeError):
                continue  # skip malformed entries

            existing = RecurringRule.query.filter_by(id=rule_id, user_id=user_id).first()
            if existing:
                existing.title = r.get("title", existing.title)
                existing.amount = float(r.get("amount", existing.amount))
                existing.category = r.get("category", existing.category)
                existing.frequency = r.get("frequency", existing.frequency)
                existing.start_date = r.get("start_date", existing.start_date)
                existing.next_due = r.get("next_due", existing.next_due)
                existing.end_date = r.get("end_date", existing.end_date)
                existing.is_active = r.get("is_active", existing.is_active)
            else:
                new_rule = RecurringRule(
                    id=rule_id,
                    user_id=user_id,
                    title=r["title"],
                    amount=float(r["amount"]),
                    category=r.get("category"),
                    frequency=r["frequency"],
                    start_date=r["start_date"],
                    next_due=r.get("next_due", r["start_date"]),
                    end_date=r.get("end_date"),
                    is_active=r.get("is_active", True),
                )
                db.session.add(new_rule)
        db.session.commit()

    # ── PUSH: upsert splits + members ───────────────────────────────────────
    incoming_splits = body.get("splits", [])
    if incoming_splits:
        for s in incoming_splits:
            try:
                split_id = uuid.UUID(str(s.get("id")))
            except (ValueError, TypeError, AttributeError):
                continue

            existing_split = Split.query.filter_by(id=split_id, user_id=user_id).first()
            if existing_split:
                existing_split.title = s.get("title", existing_split.title)
                existing_split.total_amount = float(s.get("total_amount", existing_split.total_amount))
                existing_split.transaction_id = uuid.UUID(s["transaction_id"]) if s.get("transaction_id") else existing_split.transaction_id
            else:
                new_split = Split(
                    id=split_id,
                    user_id=user_id,
                    transaction_id=uuid.UUID(s["transaction_id"]),
                    title=s["title"],
                    total_amount=float(s["total_amount"]),
                )
                db.session.add(new_split)

            # Upsert members
            for m in s.get("members", []):
                try:
                    member_id = uuid.UUID(str(m.get("id")))
                except (ValueError, TypeError, AttributeError):
                    continue

                existing_member = SplitMember.query.filter_by(id=member_id).first()
                if existing_member:
                    existing_member.name = m.get("name", existing_member.name)
                    existing_member.share_amount = float(m.get("share_amount", existing_member.share_amount))
                    existing_member.is_settled = m.get("is_settled", existing_member.is_settled)
                    if m.get("is_settled") and not existing_member.settled_at:
                        existing_member.settled_at = datetime.now(timezone.utc)
                    elif not m.get("is_settled"):
                        existing_member.settled_at = None
                else:
                    new_member = SplitMember(
                        id=member_id,
                        split_id=split_id,
                        name=m["name"],
                        share_amount=float(m["share_amount"]),
                        is_settled=m.get("is_settled", False),
                        settled_at=datetime.now(timezone.utc) if m.get("is_settled") else None,
                    )
                    db.session.add(new_member)
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

    # Pull recurring rules
    rule_query = RecurringRule.query.filter_by(user_id=user_id)
    if last_sync_ts:
        rule_query = rule_query.filter(RecurringRule.updated_at > since)
    server_rules = [r.to_dict() for r in rule_query.order_by(RecurringRule.updated_at).all()]

    # Pull splits with members
    split_query = Split.query.filter_by(user_id=user_id)
    if last_sync_ts:
        split_query = split_query.filter(Split.updated_at > since)
    server_splits = [s.to_dict() for s in split_query.order_by(Split.updated_at).all()]

    return jsonify({
        "synced_count":         len(incoming),
        "server_transactions":  server_txns,
        "server_recurring_rules": server_rules,
        "server_splits":        server_splits,
        "server_timestamp":     datetime.now(timezone.utc).isoformat(),
    }), 200
