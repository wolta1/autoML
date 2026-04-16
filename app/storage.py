"""
Storage layer: PostgreSQL for metadata + S3 for .pkl files.
"""

import uuid
import logging
from datetime import datetime

from .database import SessionLocal, TrainedModel, Favorite
from . import s3_client

logger = logging.getLogger("automl.storage")


def save_trained_model(
    model_id: str,
    pkl_bytes: bytes,
    task: str,
    model_key: str,
    model_label: str,
    model_class: str,
    target: str,
    metrics: dict,
    best_params: dict | None = None,
    features_used: list[str] | None = None,
    dropped_columns: list[str] | None = None,
    filename: str = "",
    source: str = "auto",
) -> str:
    s3_key = f"models/{model_id}.pkl"
    s3_client.upload_bytes(pkl_bytes, s3_key)

    db = SessionLocal()
    try:
        row = TrainedModel(
            model_id=model_id,
            task=task,
            model_key=model_key,
            model_label=model_label,
            model_class=model_class,
            target=target,
            metrics=metrics,
            best_params=best_params or {},
            features_used=features_used or [],
            dropped_columns=dropped_columns or [],
            filename=filename,
            s3_key=s3_key,
            source=source,
        )
        db.add(row)
        db.commit()
        logger.info("Модель %s сохранена в PostgreSQL + S3", model_id)
    finally:
        db.close()

    return model_id


def get_model_bytes(model_id: str) -> bytes | None:
    db = SessionLocal()
    try:
        row = db.query(TrainedModel).filter_by(model_id=model_id).first()
        if not row:
            return None
        return s3_client.download_bytes(row.s3_key)
    finally:
        db.close()


def get_model_s3_key(model_id: str) -> str | None:
    db = SessionLocal()
    try:
        row = db.query(TrainedModel).filter_by(model_id=model_id).first()
        return row.s3_key if row else None
    finally:
        db.close()


def add_favorite(
    model_id: str,
    task: str,
    model_key: str,
    model_label: str,
    target: str,
    metrics: dict,
    features_used: list[str],
    filename: str,
    user_id: int,
) -> dict:
    db = SessionLocal()
    try:
        trained = db.query(TrainedModel).filter_by(model_id=model_id).first()
        if not trained:
            raise FileNotFoundError(f"Модель {model_id} не найдена")

        fav_id = uuid.uuid4().hex[:12]
        fav = Favorite(
            fav_id=fav_id,
            user_id=user_id,
            model_id=model_id,
            task=task,
            model_key=model_key,
            model_label=model_label,
            target=target,
            metrics=metrics,
            features_used=features_used,
            filename=filename,
            s3_key=trained.s3_key,
        )
        db.add(fav)
        db.commit()

        entry = {
            "fav_id": fav_id,
            "model_id": model_id,
            "task": task,
            "model_key": model_key,
            "model_label": model_label,
            "target": target,
            "metrics": metrics,
            "features_used": features_used,
            "filename": filename,
            "created_at": fav.created_at.isoformat(),
        }
        logger.info("Модель %s добавлена в избранное (fav_id=%s)", model_id, fav_id)
        return entry
    finally:
        db.close()


def list_favorites(user_id: int) -> list[dict]:
    db = SessionLocal()
    try:
        rows = (
            db.query(Favorite)
            .filter_by(user_id=user_id)
            .order_by(Favorite.created_at.desc())
            .all()
        )
        return [
            {
                "fav_id": r.fav_id,
                "model_id": r.model_id,
                "task": r.task,
                "model_key": r.model_key,
                "model_label": r.model_label,
                "target": r.target,
                "metrics": r.metrics,
                "features_used": r.features_used,
                "filename": r.filename,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ]
    finally:
        db.close()


def get_favorite_bytes(fav_id: str, user_id: int) -> bytes | None:
    db = SessionLocal()
    try:
        row = (
            db.query(Favorite)
            .filter_by(fav_id=fav_id, user_id=user_id)
            .first()
        )
        if not row:
            return None
        return s3_client.download_bytes(row.s3_key)
    finally:
        db.close()


def remove_favorite(fav_id: str, user_id: int) -> bool:
    db = SessionLocal()
    try:
        row = (
            db.query(Favorite)
            .filter_by(fav_id=fav_id, user_id=user_id)
            .first()
        )
        if not row:
            return False
        db.delete(row)
        db.commit()
        logger.info("Удалено из избранного: %s", fav_id)
        return True
    finally:
        db.close()
