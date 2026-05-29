import uuid
from ..extensions import db


class Split(db.Model):
    __tablename__ = "splits"

    id              = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    transaction_id  = db.Column(db.UUID(as_uuid=True), nullable=False)  # logical ref → transactions.client_uuid
    title           = db.Column(db.Text, nullable=False)
    total_amount    = db.Column(db.Numeric(12, 2), nullable=False)
    created_at      = db.Column(db.DateTime(timezone=True), server_default=db.func.now())
    updated_at      = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), onupdate=db.func.now())

    members = db.relationship("SplitMember", backref="split", lazy="joined",
                              cascade="all, delete-orphan")

    def to_dict(self):
        """Convert the split model to a dictionary including nested members."""
        return {
            "id":             str(self.id),
            "user_id":        self.user_id,
            "transaction_id": str(self.transaction_id),
            "title":          self.title,
            "total_amount":   float(self.total_amount),
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "updated_at":     self.updated_at.isoformat() if self.updated_at else None,
            "members":        [m.to_dict() for m in self.members],
        }


class SplitMember(db.Model):
    __tablename__ = "split_members"

    id           = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    split_id     = db.Column(db.UUID(as_uuid=True), db.ForeignKey("splits.id", ondelete="CASCADE"), nullable=False)
    name         = db.Column(db.Text, nullable=False)
    share_amount = db.Column(db.Numeric(12, 2), nullable=False)
    is_settled   = db.Column(db.Boolean, default=False)
    settled_at   = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_dict(self):
        """Convert the split member model to a dictionary representation."""
        return {
            "id":           str(self.id),
            "split_id":     str(self.split_id),
            "name":         self.name,
            "share_amount": float(self.share_amount),
            "is_settled":   self.is_settled,
            "settled_at":   self.settled_at.isoformat() if self.settled_at else None,
        }
