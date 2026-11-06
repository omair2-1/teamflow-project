import os
import sys

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import User
from app.security import hash_password


def main() -> None:
    name = os.getenv("ADMIN_NAME", "")
    email = os.getenv("ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("ADMIN_PASSWORD", "")
    if not name or not email or len(password) < 10:
        raise SystemExit(
            "Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (at least 10 characters) before running."
        )

    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.email == email)):
            raise SystemExit(f"An account already exists for {email}.")
        admin = User(
            full_name=name.strip(),
            email=email,
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(admin)
        db.commit()
        print(f"Created admin account for {email}.")


if __name__ == "__main__":
    main()
