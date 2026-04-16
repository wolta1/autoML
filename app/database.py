"""
PostgreSQL connection + SQLAlchemy ORM models.
"""

import os
from datetime import datetime

from sqlalchemy import (
    create_engine, Column, String, DateTime, Integer, ForeignKey, JSON, text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://automl:automl_pass@localhost:5432/automl",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class TrainedModel(Base):
    __tablename__ = "trained_models"

    model_id = Column(String(12), primary_key=True)
    task = Column(String(50), nullable=False)
    model_key = Column(String(50))
    model_label = Column(String(100))
    model_class = Column(String(100))
    target = Column(String(100))
    metrics = Column(JSON, default={})
    best_params = Column(JSON, default={})
    features_used = Column(JSON, default=[])
    dropped_columns = Column(JSON, default=[])
    filename = Column(String(255))
    s3_key = Column(String(255), nullable=False)
    source = Column(String(20), default="auto")
    created_at = Column(DateTime, default=datetime.utcnow)


class Favorite(Base):
    __tablename__ = "favorites"

    fav_id = Column(String(12), primary_key=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    model_id = Column(String(12), nullable=False)
    task = Column(String(50))
    model_key = Column(String(50))
    model_label = Column(String(100))
    target = Column(String(100))
    metrics = Column(JSON, default={})
    features_used = Column(JSON, default=[])
    filename = Column(String(255))
    s3_key = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


_db_ready = False


def init_db():
    global _db_ready
    import time
    import logging
    log = logging.getLogger("automl.database")
    for attempt in range(10):
        try:
            Base.metadata.create_all(bind=engine)
            migrate_schema()
            _db_ready = True
            log.info("PostgreSQL таблицы инициализированы")
            return
        except Exception as e:
            log.warning("Попытка %d/10 подключения к PostgreSQL: %s", attempt + 1, e)
            if attempt < 9:
                time.sleep(3)
    log.error("Не удалось подключиться к PostgreSQL после 10 попыток. "
              "Приложение запустится, но DB-функции будут недоступны.")


def migrate_schema():
    """Добавить user_id в favorites, если таблица уже была без колонки."""
    import logging
    log = logging.getLogger("automl.database")
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE favorites ADD COLUMN IF NOT EXISTS user_id INTEGER "
                    "REFERENCES users(id) ON DELETE CASCADE"
                )
            )
    except Exception as e:
        log.warning("Миграция favorites.user_id: %s", e)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
