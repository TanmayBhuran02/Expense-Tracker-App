import uuid
from ..extensions import db


class RecurringRule(db.Model):
    __tablename__ = "recurring_rules"

    id          = db.Column(db.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title       = db.Column(db.Text, nullable=False)
    amount      = db.Column(db.Numeric(12, 2), nullable=False)
    category    = db.Column(db.Text, nullable=True)
    frequency   = db.Column(db.String(10), nullable=False)  # daily|weekly|monthly|yearly
    start_date  = db.Column(db.Date, nullable=False)
    next_due    = db.Column(db.Date, nullable=False)
    end_date    = db.Column(db.Date, nullable=True)
    is_active   = db.Column(db.Boolean, default=True)
    created_at  = db.Column(db.DateTime(timezone=True), server_default=db.func.now())
    updated_at  = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), onupdate=db.func.now())

    __table_args__ = (
        db.CheckConstraint(
            "frequency IN ('daily','weekly','monthly','yearly')",
            name="ck_recurring_rules_frequency",
        ),
    )

    def to_dict(self):
        """Convert the recurring rule model to a dictionary representation."""
        return {
            "id":         str(self.id),
            "user_id":    self.user_id,
            "title":      self.title,
            "amount":     float(self.amount),
            "category":   self.category,
            "frequency":  self.frequency,
            "start_date": self.start_date.isoformat(),
            "next_due":   self.next_due.isoformat(),
            "end_date":   self.end_date.isoformat() if self.end_date else None,
            "is_active":  self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
