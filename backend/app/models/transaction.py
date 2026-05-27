from ..extensions import db

class Transaction(db.Model):
    __tablename__ = "transactions"

    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    client_uuid = db.Column(db.UUID(as_uuid=True), nullable=False)
    amount      = db.Column(db.Numeric(12, 2), nullable=False)
    type        = db.Column(db.String(10), nullable=False)   # 'income' | 'expense'
    category    = db.Column(db.String(100), nullable=False)
    timestamp   = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at  = db.Column(db.DateTime(timezone=True), server_default=db.func.now())
    updated_at  = db.Column(db.DateTime(timezone=True), server_default=db.func.now(),
                            onupdate=db.func.now())

    __table_args__ = (
        db.UniqueConstraint("user_id", "client_uuid", name="uq_user_client_uuid"),
    )

    def to_dict(self):
        return {
            "client_uuid": str(self.client_uuid),
            "amount":      float(self.amount),
            "type":        self.type,
            "category":    self.category,
            "timestamp":   self.timestamp.isoformat(),
            "updated_at":  self.updated_at.isoformat(),
        }
