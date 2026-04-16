"""
Хеширование паролей (bcrypt). В БД хранится только hash, не plaintext.
"""

import re

import bcrypt


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            password_hash.encode("ascii"),
        )
    except (ValueError, TypeError):
        return False


USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,32}$")


def validate_username(username: str) -> str | None:
    u = (username or "").strip()
    if not USERNAME_RE.match(u):
        return "Логин: 3–32 символа, только латиница, цифры и _"
    return None


def validate_password(password: str) -> str | None:
    if len(password) < 6:
        return "Пароль не короче 6 символов"
    if len(password) > 128:
        return "Пароль слишком длинный"
    return None
