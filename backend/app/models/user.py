from ..extensions import db
import bcrypt

class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.Text, nullable=False)
    created_at    = db.Column(db.DateTime(timezone=True), server_default=db.func.now())

    # Relationship — gives us user.transactions for future RBAC / budget queries
    transactions  = db.relationship("Transaction", backref="user", lazy="dynamic",
                                    cascade="all, delete-orphan")

    def set_password(self, plain: str):
        self.password_hash = bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

    def check_password(self, plain: str) -> bool:
        return bcrypt.checkpw(plain.encode(), self.password_hash.encode())
