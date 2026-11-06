from datetime import datetime, timedelta, timezone

import jwt

from app.config import ACCESS_TOKEN_MINUTES, SECRET_KEY

ALGORITHM = "HS256"

try:
    from pwdlib import PasswordHash

    password_hash = PasswordHash.recommended()

    def hash_password(password: str) -> str:
        return password_hash.hash(password)

    def verify_password(password: str, hashed_password: str) -> bool:
        return password_hash.verify(password, hashed_password)

except ImportError:  # Local fallback for environments where pwdlib is not installed yet.
    from argon2 import PasswordHasher
    from argon2.exceptions import InvalidHashError, VerifyMismatchError

    password_hasher = PasswordHasher()

    def hash_password(password: str) -> str:
        return password_hasher.hash(password)

    def verify_password(password: str, hashed_password: str) -> bool:
        try:
            return password_hasher.verify(hashed_password, password)
        except (InvalidHashError, VerifyMismatchError):
            return False


def create_access_token(user_id: int, role: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    payload = {"sub": str(user_id), "role": role, "exp": expires_at}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
