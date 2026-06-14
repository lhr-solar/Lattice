import bcrypt

# bcrypt hash for factory default password "123456" — used for timing-safe login when user is missing
DUMMY_PASSWORD_HASH = "$2b$12$RHev5cGznq8795sM6xF1V.trB.ps4nGBYwGj6WrhnrHfOYLjDAy/2"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
