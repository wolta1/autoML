"""
Регистрация и управление пользователями в PostgreSQL.
"""

import logging

from sqlalchemy.exc import IntegrityError

from .database import SessionLocal, User
from .auth_utils import (
    hash_password,
    verify_password,
    validate_username,
    validate_password,
)

logger = logging.getLogger("automl.users")


def create_user(username: str, password: str) -> tuple[User | None, str | None]:
    err = validate_username(username)
    if err:
        return None, err
    err = validate_password(password)
    if err:
        return None, err

    db = SessionLocal()
    try:
        u = User(
            username=username.strip(),
            password_hash=hash_password(password),
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        logger.info("Зарегистрирован пользователь: %s", u.username)
        return u, None
    except IntegrityError:
        db.rollback()
        return None, "Такой логин уже занят"
    finally:
        db.close()


def authenticate(username: str, password: str) -> tuple[User | None, str | None]:
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(username=(username or "").strip()).first()
        if not u or not verify_password(password, u.password_hash):
            return None, "Неверный логин или пароль"
        return u, None
    finally:
        db.close()


def get_user_by_id(user_id: int) -> User | None:
    db = SessionLocal()
    try:
        return db.query(User).filter_by(id=user_id).first()
    finally:
        db.close()


def change_username(user_id: int, new_username: str, current_password: str) -> str | None:
    err = validate_username(new_username)
    if err:
        return err
    err = validate_password(current_password)
    if err:
        return err

    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=user_id).first()
        if not u:
            return "Пользователь не найден"
        if not verify_password(current_password, u.password_hash):
            return "Неверный пароль"
        u.username = new_username.strip()
        db.commit()
        logger.info("Пользователь %s сменил логин", user_id)
        return None
    except IntegrityError:
        db.rollback()
        return "Такой логин уже занят"
    finally:
        db.close()


def change_password(user_id: int, old_password: str, new_password: str) -> str | None:
    err = validate_password(new_password)
    if err:
        return err

    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=user_id).first()
        if not u:
            return "Пользователь не найден"
        if not verify_password(old_password, u.password_hash):
            return "Неверный текущий пароль"
        u.password_hash = hash_password(new_password)
        db.commit()
        logger.info("Пользователь %s сменил пароль", user_id)
        return None
    finally:
        db.close()


def delete_user(user_id: int, password: str) -> str | None:
    db = SessionLocal()
    try:
        u = db.query(User).filter_by(id=user_id).first()
        if not u:
            return "Пользователь не найден"
        if not verify_password(password, u.password_hash):
            return "Неверный пароль"
        db.delete(u)
        db.commit()
        logger.info("Удалён пользователь id=%s", user_id)
        return None
    finally:
        db.close()
