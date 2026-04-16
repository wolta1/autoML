"""
ML-пайплайн: загрузка данных -> определение задачи -> очистка -> обучение -> сериализация.
"""

import re
import io
import uuid
import pickle
import hashlib
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline as SkPipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import (
    LabelEncoder, StandardScaler, MinMaxScaler, RobustScaler,
    OneHotEncoder, OrdinalEncoder, TargetEncoder,
)
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import (
    accuracy_score, f1_score, r2_score, mean_absolute_error,
    mean_squared_error,
)

logger = logging.getLogger("automl.pipeline")


ID_PATTERNS = re.compile(
    r"^(id|index|unnamed.*|№|row_?id|row_?num|record_?id|Unnamed.*|__index.*)$",
    re.IGNORECASE,
)
NAME_PATTERNS = re.compile(
    r"(^name$|^фио$|^имя$|^фамилия$|^отчество$|"
    r"first_?name|last_?name|middle_?name|full_?name|"
    r"surname|patronymic|email|phone|телефон|адрес|address)",
    re.IGNORECASE,
)

MODEL_MAP = {
    "classification": {
        "linear": LogisticRegression,
        "tree": DecisionTreeClassifier,
        "boosting": GradientBoostingClassifier,
    },
    "regression": {
        "linear": LinearRegression,
        "tree": DecisionTreeRegressor,
        "boosting": GradientBoostingRegressor,
    },
}

MODEL_LABELS = {
    "linear": "Линейная регрессия / Логистическая регрессия",
    "tree": "Дерево решений",
    "boosting": "Градиентный бустинг",
}


def _is_string_dtype(series: pd.Series) -> bool:
    """Проверка на строковый тип, совместимая с pandas 2.x и 3.x."""
    if series.dtype == object:
        return True
    dtype_str = str(series.dtype).lower()
    return "string" in dtype_str or "str" in dtype_str or "category" in dtype_str


def _safe_nunique(series: pd.Series) -> int:
    try:
        return series.nunique()
    except TypeError:
        return series.astype(str).nunique()


def load_dataframe(file_bytes: bytes, filename: str) -> pd.DataFrame:
    ext = filename.rsplit(".", 1)[-1].lower()

    if ext in ("csv", "txt"):
        for encoding in ("utf-8", "cp1251", "latin-1"):
            try:
                df = pd.read_csv(io.BytesIO(file_bytes), encoding=encoding)
                logger.info("Файл %s прочитан (encoding=%s)", filename, encoding)
                return df
            except UnicodeDecodeError:
                continue
        raise ValueError(f"Не удалось определить кодировку файла {filename}")

    if ext in ("xlsx", "xls"):
        df = pd.read_excel(io.BytesIO(file_bytes))
        logger.info("Файл %s прочитан (excel)", filename)
        return df

    raise ValueError(f"Неподдерживаемый формат: .{ext}")


def detect_task(y: pd.Series) -> str:
    if _is_string_dtype(y):
        return "classification"
    if y.dtype == bool or str(y.dtype) == "boolean":
        return "classification"
    nunique = _safe_nunique(y)
    if nunique <= 20 and nunique / max(len(y), 1) < 0.05:
        return "classification"
    return "regression"


def _is_id_column(col: str, series: pd.Series) -> bool:
    if ID_PATTERNS.match(col.strip()):
        return True
    if pd.api.types.is_numeric_dtype(series) and series.is_unique and series.is_monotonic_increasing:
        diffs = series.dropna().diff().dropna()
        if len(diffs) > 0:
            uniq = diffs.unique()
            if len(uniq) == 1 and uniq[0] == 1:
                return True
    return False


def _is_name_column(col: str) -> bool:
    return bool(NAME_PATTERNS.search(col.strip()))


def _is_high_cardinality_text(series: pd.Series, total_rows: int) -> bool:
    if not _is_string_dtype(series):
        return False
    nunique = _safe_nunique(series)
    if nunique > 0.9 * total_rows and total_rows > 20:
        return True
    return False


def _is_constant_column(series: pd.Series) -> bool:
    return _safe_nunique(series.dropna()) <= 1


def drop_useless_columns(df: pd.DataFrame, target: str) -> tuple[pd.DataFrame, list[str]]:
    dropped = []
    total = len(df)
    for col in list(df.columns):
        if col == target:
            continue

        reason = None
        if _is_id_column(col, df[col]):
            reason = "ID-подобная колонка"
        elif _is_name_column(col):
            reason = "персональные данные"
        elif _is_high_cardinality_text(df[col], total):
            reason = "уникальный текст (высокая кардинальность)"
        elif _is_constant_column(df[col]):
            reason = "константа (одно значение)"
        elif df[col].isna().sum() / max(total, 1) > 0.9:
            reason = "более 90% пропусков"

        if reason:
            logger.info("  Удалён столбец '%s': %s", col, reason)
            dropped.append(col)

    df = df.drop(columns=dropped)
    return df, dropped


REPORTS_DIR = Path("app/_reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def run_pipeline(
    file_bytes: bytes,
    filename: str,
    target: str,
    model_key: str,
) -> dict:
    """Автоматический пайплайн.

    Результат — sklearn Pipeline (preprocessor + model) внутри dict.
    Загрузка и использование::

        import pickle, pandas as pd
        with open("model_xxx.pkl", "rb") as f:
            data = pickle.load(f)
        preds = data["pipeline"].predict(pd.read_csv("new.csv"))
    """
    import json as _json

    steps: list[dict] = []

    def _step(name: str, **details):
        entry = {"step": name, **details}
        steps.append(entry)
        logger.info("  [STEP] %s  %s", name,
                     {k: v for k, v in details.items() if k != "details"})

    logger.info("=" * 60)
    logger.info("Новый запуск пайплайна")
    logger.info("  Файл: %s | Target: %s | Модель: %s", filename, target, model_key)

    df = load_dataframe(file_bytes, filename)
    _step("Загрузка данных", filename=filename,
          rows=df.shape[0], columns=df.shape[1],
          dtypes={col: str(dt) for col, dt in df.dtypes.items()})

    if target not in df.columns:
        raise ValueError(f"Колонка «{target}» не найдена в данных")

    rows_before = len(df)
    df = df.dropna(subset=[target])
    _step("Пропуски в целевой переменной",
          target=target, rows_dropped=rows_before - len(df),
          rows_remaining=len(df))

    if len(df) < 10:
        raise ValueError("Слишком мало данных для обучения (менее 10 строк)")

    before_dup = len(df)
    df = df.drop_duplicates()
    _step("Удаление дубликатов",
          full_duplicates_found=before_dup - len(df),
          rows_remaining=len(df))

    task = detect_task(df[target])
    _step("Определение типа задачи",
          task=task, target_unique=int(_safe_nunique(df[target])))

    df, dropped_cols = drop_useless_columns(df, target)
    _step("Удаление бесполезных столбцов",
          dropped=dropped_cols, columns_remaining=df.shape[1] - 1)

    y = df[target]
    X = df.drop(columns=[target]).copy()

    for c in X.columns:
        if X[c].dtype == bool or str(X[c].dtype) == "boolean":
            X[c] = X[c].astype(int)

    cat_cols = [c for c in X.columns if _is_string_dtype(X[c])]
    num_cols = [c for c in X.columns if c not in cat_cols]

    _step("Определение типов столбцов",
          numeric=num_cols, categorical=cat_cols)

    if X.shape[1] == 0:
        raise ValueError("После обработки не осталось признаков для обучения")

    transformers = []

    if num_cols:
        num_pipe = SkPipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ])
        transformers.append(("num", num_pipe, num_cols))

    if cat_cols:
        cat_pipe = SkPipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OrdinalEncoder(
                handle_unknown="use_encoded_value", unknown_value=-1)),
        ])
        transformers.append(("cat", cat_pipe, cat_cols))

    preprocessor = ColumnTransformer(transformers, remainder="drop")

    model_cls = MODEL_MAP[task][model_key]
    if model_key == "linear" and task == "classification":
        model = model_cls(max_iter=1000)
    else:
        model = model_cls()

    pipe = SkPipeline([
        ("preprocessor", preprocessor),
        ("model", model),
    ])

    _step("Сборка Pipeline",
          numeric_pipeline="SimpleImputer(median) → StandardScaler",
          categorical_pipeline="SimpleImputer(most_frequent) → OrdinalEncoder",
          model=model_cls.__name__)

    test_size = min(0.2, max(5, int(len(y) * 0.2)) / len(y))
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42,
    )
    _step("Разделение train/test",
          train_size=len(y_train), test_size=len(y_test),
          test_ratio=round(float(test_size), 3))

    pipe.fit(X_train, y_train)

    _step("Обучение модели",
          model_class=model_cls.__name__, model_key=model_key,
          params={k: v for k, v in model.get_params().items()
                  if v is not None and k not in
                  ("random_state", "verbose", "n_jobs")})

    y_pred = pipe.predict(X_test)

    if task == "classification":
        metrics = {
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
            "f1": round(float(f1_score(y_test, y_pred, average="weighted")), 4),
        }
    else:
        metrics = {
            "r2": round(float(r2_score(y_test, y_pred)), 4),
            "mae": round(float(mean_absolute_error(y_test, y_pred)), 4),
            "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
        }

    _step("Оценка качества", metrics=metrics)
    logger.info("  Метрики: %s", metrics)

    from .storage import save_trained_model

    model_id = uuid.uuid4().hex[:12]
    created_at = datetime.now().isoformat()

    artifact = {
        "pipeline": pipe,
        "task": task,
        "target": target,
        "metrics": metrics,
        "dropped_columns": dropped_cols,
        "feature_names": list(X.columns),
        "model_label": MODEL_LABELS.get(model_key, model_key),
        "pipeline_steps": steps,
        "created_at": created_at,
        "filename": filename,
    }

    pkl_bytes = pickle.dumps(artifact)
    save_trained_model(
        model_id=model_id,
        pkl_bytes=pkl_bytes,
        task=task,
        model_key=model_key,
        model_label=MODEL_LABELS.get(model_key, model_key),
        model_class=model_cls.__name__,
        target=target,
        metrics=metrics,
        features_used=list(X.columns),
        dropped_columns=dropped_cols,
        filename=filename,
        source="auto",
    )

    report = {
        "model_id": model_id,
        "filename": filename,
        "target": target,
        "task": task,
        "model": model_cls.__name__,
        "created_at": created_at,
        "steps": steps,
    }
    report_path = REPORTS_DIR / f"{model_id}_steps.json"
    report_path.write_text(
        _json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info("  Пайплайн сохранён в S3: models/%s.pkl", model_id)
    logger.info("  Отчёт сохранён: %s", report_path)
    logger.info("=" * 60)

    return {
        "model_id": model_id,
        "task": task,
        "metrics": metrics,
        "dropped_columns": dropped_cols,
        "features_used": list(X.columns),
        "model_label": MODEL_LABELS.get(model_key, model_key),
        "pipeline_steps": steps,
    }
