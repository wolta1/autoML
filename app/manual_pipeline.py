"""
Настраиваемый ML-пайплайн для ручного обучения.
Пользователь выбирает: обработку выбросов, стратегию пропусков, дубли,
кодирование, шкалирование, модель, гиперпараметры или автоподбор через Optuna.

Результат — sklearn Pipeline внутри dict.  Загрузка::

    import pickle, pandas as pd
    with open("model_xxx.pkl", "rb") as f:
        data = pickle.load(f)
    preds = data["pipeline"].predict(pd.read_csv("new.csv"))
"""

import uuid
import pickle
import logging
import numpy as np
import pandas as pd
from datetime import datetime

from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline as SkPipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import (
    LabelEncoder, StandardScaler, MinMaxScaler, RobustScaler,
    OneHotEncoder, OrdinalEncoder, TargetEncoder,
)
from sklearn.linear_model import LogisticRegression, Ridge, Lasso
from sklearn.ensemble import (
    RandomForestClassifier, RandomForestRegressor,
    GradientBoostingClassifier, GradientBoostingRegressor,
)
from sklearn.metrics import (
    accuracy_score, f1_score, r2_score,
    mean_absolute_error, mean_squared_error,
)

try:
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    OPTUNA_AVAILABLE = True
except ImportError:
    OPTUNA_AVAILABLE = False

from .pipeline import (
    MODEL_LABELS,
    load_dataframe, detect_task, _is_string_dtype,
    _is_id_column, _is_name_column,
)

logger = logging.getLogger("automl.manual_pipeline")


def _clip_outliers(df: pd.DataFrame, rules: list[dict]) -> pd.DataFrame:
    for rule in rules:
        col = rule.get("field", "")
        if col not in df.columns or not pd.api.types.is_numeric_dtype(df[col]):
            continue
        lo = rule.get("min")
        hi = rule.get("max")
        if lo is not None:
            df[col] = df[col].clip(lower=float(lo))
        if hi is not None:
            df[col] = df[col].clip(upper=float(hi))
        logger.info("  Outlier clip '%s': [%s, %s]", col, lo, hi)
    return df


def _remove_duplicates(df: pd.DataFrame, target: str,
                       remove_full: bool, remove_by_id: bool) -> pd.DataFrame:
    n_before = len(df)
    if remove_full:
        df = df.drop_duplicates()
        logger.info("  Удалено полных дубликатов: %d", n_before - len(df))
    if remove_by_id:
        id_cols = [c for c in df.columns if c != target and _is_id_column(c, df[c])]
        if id_cols:
            n2 = len(df)
            df = df.drop_duplicates(subset=id_cols)
            logger.info("  Удалено дубликатов по ID-колонкам %s: %d", id_cols, n2 - len(df))
    return df


def _drop_useless(df: pd.DataFrame, target: str) -> tuple[pd.DataFrame, list[str]]:
    dropped = []
    total = len(df)
    for col in list(df.columns):
        if col == target:
            continue
        if _is_id_column(col, df[col]):
            dropped.append(col)
        elif _is_name_column(col):
            dropped.append(col)
        elif _is_string_dtype(df[col]) and df[col].nunique() > 0.9 * total and total > 20:
            dropped.append(col)
        elif df[col].nunique() <= 1:
            dropped.append(col)
        elif df[col].isna().sum() / max(total, 1) > 0.9:
            dropped.append(col)
    if dropped:
        df = df.drop(columns=dropped)
        logger.info("  Автоматически удалены столбцы: %s", dropped)
    return df, dropped


def _optuna_search(X_train, y_train, X_val, y_val, task, model_type, n_trials=20):
    if not OPTUNA_AVAILABLE:
        logger.warning("Optuna не установлена — используются параметры по умолчанию")
        return {}

    def objective(trial):
        model = _build_trial_model(trial, task, model_type)
        model.fit(X_train, y_train)
        pred = model.predict(X_val)
        if task == "classification":
            return accuracy_score(y_val, pred)
        return r2_score(y_val, pred)

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials, timeout=120)
    logger.info("  Optuna лучший trial: %s (score=%.4f)",
                study.best_params, study.best_value)
    return study.best_params


def _build_trial_model(trial, task, model_type):
    if model_type == "linear":
        C = trial.suggest_float("C", 0.01, 100, log=True)
        if task == "classification":
            return LogisticRegression(C=C, max_iter=1000, random_state=42)
        return Ridge(alpha=1.0 / C, random_state=42)

    if model_type == "trees":
        n_est = trial.suggest_int("n_estimators", 50, 400)
        depth = trial.suggest_int("max_depth", 3, 20)
        if task == "classification":
            return RandomForestClassifier(
                n_estimators=n_est, max_depth=depth, random_state=42)
        return RandomForestRegressor(
            n_estimators=n_est, max_depth=depth, random_state=42)

    lr = trial.suggest_float("learning_rate", 0.01, 0.3, log=True)
    depth = trial.suggest_int("max_depth", 3, 10)
    n_est = trial.suggest_int("n_estimators", 50, 300)
    if task == "classification":
        return GradientBoostingClassifier(
            learning_rate=lr, max_depth=depth, n_estimators=n_est,
            random_state=42)
    return GradientBoostingRegressor(
        learning_rate=lr, max_depth=depth, n_estimators=n_est,
        random_state=42)


def _create_model(task, model_type, params: dict):
    if model_type == "linear":
        C = params.get("C", 1.0)
        penalty = params.get("penalty", "l2")
        if task == "classification":
            solver = "saga" if penalty == "elasticnet" else "lbfgs"
            return LogisticRegression(C=C, penalty=penalty, solver=solver,
                                     max_iter=1000, random_state=42)
        if penalty == "l1":
            return Lasso(alpha=1.0 / C, random_state=42)
        return Ridge(alpha=1.0 / C, random_state=42)

    if model_type == "trees":
        n_est = params.get("n_estimators", 100)
        depth = params.get("max_depth")
        if task == "classification":
            return RandomForestClassifier(
                n_estimators=n_est, max_depth=depth, random_state=42)
        return RandomForestRegressor(
            n_estimators=n_est, max_depth=depth, random_state=42)

    lr = params.get("learning_rate", 0.1)
    depth = params.get("max_depth", 6)
    n_est = params.get("n_estimators", 100)
    if task == "classification":
        return GradientBoostingClassifier(
            learning_rate=lr, max_depth=depth, n_estimators=n_est,
            random_state=42)
    return GradientBoostingRegressor(
        learning_rate=lr, max_depth=depth, n_estimators=n_est,
        random_state=42)


IMPORTANT_PARAMS = {
    "LogisticRegression": ["C", "penalty", "solver"],
    "Ridge": ["alpha"],
    "Lasso": ["alpha"],
    "RandomForestClassifier": ["n_estimators", "max_depth", "min_samples_split"],
    "RandomForestRegressor": ["n_estimators", "max_depth", "min_samples_split"],
    "GradientBoostingClassifier": ["n_estimators", "learning_rate", "max_depth"],
    "GradientBoostingRegressor": ["n_estimators", "learning_rate", "max_depth"],
}


def extract_baseline_info(obj) -> dict:
    info: dict = {"model_type": "Неизвестно", "hyperparams": {}, "metrics": {}, "task": ""}

    pipeline = None
    if isinstance(obj, dict):
        pipeline = obj.get("pipeline")
        info["metrics"] = obj.get("metrics", {})
        info["task"] = obj.get("task", "")
    elif hasattr(obj, "predict"):
        pipeline = obj

    if pipeline is None:
        raise ValueError("Объект не содержит модель sklearn")

    model = None
    if hasattr(pipeline, "named_steps"):
        model = pipeline.named_steps.get("model", list(pipeline.named_steps.values())[-1])
    elif hasattr(pipeline, "get_params"):
        model = pipeline

    if model is not None:
        cls_name = type(model).__name__
        info["model_type"] = cls_name
        all_params = model.get_params() if hasattr(model, "get_params") else {}
        keys = IMPORTANT_PARAMS.get(cls_name, list(all_params.keys())[:6])
        info["hyperparams"] = {k: all_params[k] for k in keys if k in all_params}

    return info


def evaluate_baseline(obj, X_test, y_test, task: str) -> dict:
    pipeline = obj.get("pipeline") if isinstance(obj, dict) else obj
    if pipeline is None or not hasattr(pipeline, "predict"):
        return {}
    try:
        y_pred = pipeline.predict(X_test)
    except Exception as exc:
        logger.warning("Baseline predict failed: %s", exc)
        return {}

    if task == "classification":
        return {
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
            "f1": round(float(f1_score(y_test, y_pred, average="weighted")), 4),
        }
    return {
        "r2": round(float(r2_score(y_test, y_pred)), 4),
        "mae": round(float(mean_absolute_error(y_test, y_pred)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
    }



def _build_num_pipeline(missing_strategy: str, scaling_type: str) -> SkPipeline:
    strategy_map = {"mean": "mean", "median": "median"}
    imp_strategy = strategy_map.get(missing_strategy, "median")

    steps = [("imputer", SimpleImputer(strategy=imp_strategy))]

    if scaling_type == "standard":
        steps.append(("scaler", StandardScaler()))
    elif scaling_type == "minmax":
        steps.append(("scaler", MinMaxScaler()))
    elif scaling_type == "robust":
        steps.append(("scaler", RobustScaler()))

    return SkPipeline(steps)


def _build_cat_pipeline(encoding_type: str) -> SkPipeline:
    steps = [
        ("imputer", SimpleImputer(strategy="most_frequent")),
    ]

    if encoding_type == "onehot":
        steps.append(("encoder", OneHotEncoder(
            sparse_output=False, handle_unknown="ignore")))
    elif encoding_type == "target":
        steps.append(("encoder", TargetEncoder(random_state=42)))
    elif encoding_type == "ordinal":
        steps.append(("encoder", OrdinalEncoder(
            handle_unknown="use_encoded_value", unknown_value=-1)))
    else:
        steps.append(("encoder", OrdinalEncoder(
            handle_unknown="use_encoded_value", unknown_value=-1)))

    return SkPipeline(steps)


def run_manual_pipeline(
    file_bytes: bytes,
    filename: str,
    target: str,
    missing_strategy: str = "mean",
    remove_id_dups: bool = False,
    remove_full_dups: bool = False,
    encoding_type: str = "onehot",
    scaling_type: str = "none",
    model_type: str = "linear",
    hparam_mode: str = "auto",
    outlier_rules: list[dict] | None = None,
    manual_params: dict | None = None,
    baseline_path: str | None = None,
) -> dict:
    logger.info("=" * 60)
    logger.info("Ручной пайплайн")
    logger.info("  Файл: %s | Target: %s | Модель: %s",
                filename, target, model_type)
    logger.info("  Кодирование: %s | Шкалирование: %s | Гиперпараметры: %s",
                encoding_type, scaling_type, hparam_mode)

    df = load_dataframe(file_bytes, filename)
    logger.info("  Размер: %d x %d", *df.shape)

    if target not in df.columns:
        raise ValueError(f"Колонка «{target}» не найдена")

    df = df.dropna(subset=[target])
    if len(df) < 10:
        raise ValueError("Слишком мало данных (< 10 строк)")

    if outlier_rules:
        df = _clip_outliers(df, outlier_rules)

    df = _remove_duplicates(df, target, remove_full_dups, remove_id_dups)
    df, dropped_cols = _drop_useless(df, target)

    task = detect_task(df[target])
    logger.info("  Задача: %s", task)

    y = df[target]
    X = df.drop(columns=[target]).copy()

    for c in X.columns:
        if X[c].dtype == bool or str(X[c].dtype) == "boolean":
            X[c] = X[c].astype(int)

    cat_cols = [c for c in X.columns if _is_string_dtype(X[c])]
    num_cols = [c for c in X.columns if c not in cat_cols]

    if X.shape[1] == 0:
        raise ValueError("Не осталось признаков после обработки")

    logger.info("  Числовые: %d | Категориальные: %d",
                len(num_cols), len(cat_cols))

    transformers = []
    if num_cols:
        transformers.append((
            "num", _build_num_pipeline(missing_strategy, scaling_type), num_cols))
    if cat_cols:
        transformers.append((
            "cat", _build_cat_pipeline(encoding_type), cat_cols))

    preprocessor = ColumnTransformer(transformers, remainder="drop")

    test_size = min(0.2, max(5, int(len(y) * 0.2)) / len(y))
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42)
    logger.info("  Train: %d | Test: %d", len(y_train), len(y_test))

    preprocessor.fit(X_train, y_train)

    if missing_strategy in ("zero", "min", "max") and num_cols:
        imputer = preprocessor.named_transformers_["num"].named_steps["imputer"]
        if missing_strategy == "zero":
            imputer.statistics_ = np.zeros(len(num_cols))
        elif missing_strategy == "min":
            imputer.statistics_ = X_train[num_cols].min().values.astype(float)
        elif missing_strategy == "max":
            imputer.statistics_ = X_train[num_cols].max().values.astype(float)

    X_tr = preprocessor.transform(X_train)
    X_te = preprocessor.transform(X_test)

    best_params = manual_params or {}

    if hparam_mode == "auto":
        logger.info("  Запуск Optuna (%s)...",
                     "доступна" if OPTUNA_AVAILABLE else "НЕ установлена")
        best_params = _optuna_search(
            X_tr, y_train, X_te, y_test, task, model_type)

    model = _create_model(task, model_type, best_params)
    logger.info("  Обучение %s с параметрами %s ...",
                type(model).__name__, best_params)
    model.fit(X_tr, y_train)
    logger.info("  Модель обучена")

    y_pred = model.predict(X_te)
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
    logger.info("  Метрики: %s", metrics)

    baseline_comparison = None
    if baseline_path:
        try:
            with open(baseline_path, "rb") as bf:
                bl_obj = pickle.load(bf)
            bl_metrics = evaluate_baseline(bl_obj, X_test, y_test, task)
            if bl_metrics:
                primary = "accuracy" if task == "classification" else "r2"
                new_val = metrics.get(primary, 0)
                bl_val = bl_metrics.get(primary, 0)
                is_better = new_val >= bl_val
                baseline_comparison = {
                    "baseline_metrics": bl_metrics,
                    "new_metrics": metrics,
                    "primary_metric": primary,
                    "is_better": is_better,
                }
                logger.info("  Baseline: %s=%s → New: %s=%s (%s)",
                            primary, bl_val, primary, new_val,
                            "лучше" if is_better else "хуже")
        except Exception as exc:
            logger.warning("Не удалось оценить baseline: %s", exc)

    from .storage import save_trained_model

    pipe = SkPipeline([
        ("preprocessor", preprocessor),
        ("model", model),
    ])

    model_id = uuid.uuid4().hex[:12]

    artifact = {
        "pipeline": pipe,
        "task": task,
        "target": target,
        "metrics": metrics,
        "best_params": best_params,
        "dropped_columns": dropped_cols,
        "feature_names": list(X.columns),
        "created_at": datetime.now().isoformat(),
        "filename": filename,
    }

    pkl_bytes = pickle.dumps(artifact)
    save_trained_model(
        model_id=model_id,
        pkl_bytes=pkl_bytes,
        task=task,
        model_key=model_type,
        model_label={"linear": "Линейная модель", "trees": "RandomForest",
                      "catboost": "Градиентный бустинг"}.get(model_type, model_type),
        model_class=type(model).__name__,
        target=target,
        metrics=metrics,
        best_params=best_params,
        features_used=list(X.columns),
        dropped_columns=dropped_cols,
        filename=filename,
        source="manual",
    )

    logger.info("  Пайплайн сохранён в S3: models/%s.pkl", model_id)
    logger.info("=" * 60)

    model_label_map = {
        "linear": "Линейная модель",
        "trees": "RandomForest",
        "catboost": "Градиентный бустинг",
    }

    result = {
        "model_id": model_id,
        "task": task,
        "metrics": metrics,
        "best_params": best_params,
        "dropped_columns": dropped_cols,
        "features_used": list(X.columns),
        "model_label": model_label_map.get(model_type, model_type),
        "model_class": type(model).__name__,
        "optuna_used": hparam_mode == "auto" and OPTUNA_AVAILABLE,
    }
    if baseline_comparison:
        result["baseline_comparison"] = baseline_comparison
    return result
