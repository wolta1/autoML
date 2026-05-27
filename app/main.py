import logging
import json
import uuid
import pickle
import os
from pathlib import Path
from io import BytesIO
from fastapi import FastAPI, Request, UploadFile, File, Form, Body, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware
from pydantic import BaseModel, Field
from .database import init_db
from .pipeline import run_pipeline, REPORTS_DIR
from .manual_pipeline import run_manual_pipeline, extract_baseline_info
from .storage import (
    get_model_bytes, add_favorite, list_favorites,
    get_favorite_bytes, remove_favorite,
)
from . import users_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-22s  %(levelname)-7s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("automl.server")

SESSION_SECRET = os.getenv(
    "SESSION_SECRET",
    "dev-session-secret-change-in-production-min-32-chars!",
)

app = FastAPI()
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=60 * 60 * 24 * 14,
    same_site="lax",
    https_only=False,
)

class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response


app.mount("/static", NoCacheStaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


def _session_user_id(request: Request) -> int | None:
    uid = request.session.get("user_id")
    return int(uid) if uid is not None else None


def _require_user(request: Request) -> int:
    uid = _session_user_id(request)
    if uid is None:
        raise HTTPException(401, "Необходимо войти в личный кабинет")
    return uid


def _safe_next(next_param: str | None) -> str:
    if next_param and next_param.startswith("/") and not next_param.startswith("//"):
        return next_param
    return "/profile"


class RegisterBody(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class LoginBody(BaseModel):
    username: str
    password: str


class ChangeUsernameBody(BaseModel):
    new_username: str = Field(..., min_length=1, max_length=64)
    password: str


class ChangePasswordBody(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6, max_length=128)


class DeleteAccountBody(BaseModel):
    password: str


@app.on_event("startup")
def on_startup():
    init_db()
    logger.info("PostgreSQL инициализация завершена")
    

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if _session_user_id(request):
        return RedirectResponse("/profile", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/login/")
async def login_page_trailing_slash(request: Request):
    q = request.url.query
    target = "/login" + (f"?{q}" if q else "")
    return RedirectResponse(target, status_code=307)


@app.get("/automatic-learning", response_class=HTMLResponse)
async def automl(request: Request):
    return templates.TemplateResponse("automatic_learning.html", {"request": request})


@app.get("/manual-learning", response_class=HTMLResponse)
async def manual_learning(request: Request):
    return templates.TemplateResponse("manual_learning.html", {"request": request})


@app.get("/constructor", response_class=HTMLResponse)
async def constructor(request: Request):
    return templates.TemplateResponse("constructor.html", {"request": request})


@app.get("/profile", response_class=HTMLResponse)
async def profile(request: Request):
    uid = _session_user_id(request)
    if uid is None:
        return RedirectResponse("/login?next=/profile", status_code=302)
    user = users_service.get_user_by_id(uid)
    if not user:
        request.session.clear()
        return RedirectResponse("/login?next=/profile", status_code=302)
    return templates.TemplateResponse(
        "profile.html",
        {"request": request, "username": user.username},
    )


@app.post("/api/register")
async def api_register(request: Request, body: RegisterBody):
    user, err = users_service.create_user(body.username, body.password)
    if err:
        raise HTTPException(400, err)
    request.session["user_id"] = user.id
    request.session["username"] = user.username
    logger.info("Регистрация и вход: user_id=%s", user.id)
    return {"ok": True, "username": user.username}


@app.post("/api/login")
async def api_login(request: Request, body: LoginBody):
    user, err = users_service.authenticate(body.username, body.password)
    if err:
        raise HTTPException(401, err)
    request.session["user_id"] = user.id
    request.session["username"] = user.username
    logger.info("Вход: user_id=%s", user.id)
    return {"ok": True, "username": user.username}


@app.post("/api/logout")
async def api_logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
async def api_me(request: Request):
    uid = _session_user_id(request)
    if uid is None:
        raise HTTPException(401, "Не авторизован")
    user = users_service.get_user_by_id(uid)
    if not user:
        request.session.clear()
        raise HTTPException(401, "Не авторизован")
    return {"id": user.id, "username": user.username}


@app.post("/api/account/username")
async def api_change_username(request: Request, body: ChangeUsernameBody):
    uid = _require_user(request)
    err = users_service.change_username(uid, body.new_username, body.password)
    if err:
        raise HTTPException(400, err)
    request.session["username"] = body.new_username.strip()
    return {"ok": True, "username": body.new_username.strip()}


@app.post("/api/account/password")
async def api_change_password(request: Request, body: ChangePasswordBody):
    uid = _require_user(request)
    err = users_service.change_password(uid, body.old_password, body.new_password)
    if err:
        raise HTTPException(400, err)
    return {"ok": True}


@app.post("/api/account/delete")
async def api_delete_account(request: Request, body: DeleteAccountBody):
    uid = _require_user(request)
    err = users_service.delete_user(uid, body.password)
    if err:
        raise HTTPException(400, err)
    request.session.clear()
    return {"ok": True}


@app.post("/train")
async def train_model(
    file: UploadFile = File(...),
    target: str = Form(...),
    model: str = Form(...),
):
    logger.info("Запрос на обучение: файл=%s, target=%s, модель=%s",
                file.filename, target, model)

    if model not in ("linear", "tree", "boosting"):
        raise HTTPException(400, "Неизвестная модель")

    file_bytes = await file.read()
    logger.info("Файл получен: %d байт", len(file_bytes))

    try:
        result = run_pipeline(file_bytes, file.filename, target, model)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        logger.exception("Ошибка обучения")
        raise HTTPException(500, f"Ошибка обучения: {e}")

    logger.info("Обучение завершено: model_id=%s, задача=%s",
                result["model_id"], result["task"])
    return JSONResponse(result)


BASELINE_DIR = Path("app/_baselines")
BASELINE_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/upload-baseline")
async def upload_baseline(file: UploadFile = File(...)):
    logger.info("Загрузка baseline модели: %s", file.filename)
    if not file.filename.endswith(".pkl"):
        raise HTTPException(400, "Файл должен быть в формате .pkl")

    file_bytes = await file.read()
    try:
        obj = pickle.loads(file_bytes)
    except Exception as e:
        raise HTTPException(400, f"Не удалось загрузить .pkl файл: {e}")

    try:
        info = extract_baseline_info(obj)
    except ValueError as e:
        raise HTTPException(400, str(e))

    baseline_id = uuid.uuid4().hex[:12]
    path = BASELINE_DIR / f"baseline_{baseline_id}.pkl"
    with open(path, "wb") as f:
        f.write(file_bytes)

    info["baseline_id"] = baseline_id
    return JSONResponse(info)


@app.post("/manual-train")
async def manual_train(
    file: UploadFile = File(...),
    target: str = Form(...),
    missing_strategy: str = Form("mean"),
    remove_id_dups: str = Form("false"),
    remove_full_dups: str = Form("false"),
    encoding_type: str = Form("onehot"),
    scaling_type: str = Form("none"),
    model_type: str = Form("linear"),
    hparam_mode: str = Form("auto"),
    outlier_rules: str = Form("[]"),
    manual_params: str = Form("{}"),
    baseline_id: str = Form(""),
):
    logger.info("Ручное обучение: файл=%s, target=%s, модель=%s",
                file.filename, target, model_type)

    file_bytes = await file.read()

    try:
        rules = json.loads(outlier_rules)
    except (json.JSONDecodeError, TypeError):
        rules = []

    try:
        params = json.loads(manual_params)
    except (json.JSONDecodeError, TypeError):
        params = {}

    bl_path = None
    if baseline_id:
        bl_path = str(BASELINE_DIR / f"baseline_{baseline_id}.pkl")
        if not Path(bl_path).exists():
            bl_path = None

    try:
        result = run_manual_pipeline(
            file_bytes=file_bytes,
            filename=file.filename,
            target=target,
            missing_strategy=missing_strategy,
            remove_id_dups=remove_id_dups.lower() in ("true", "1", "on"),
            remove_full_dups=remove_full_dups.lower() in ("true", "1", "on"),
            encoding_type=encoding_type,
            scaling_type=scaling_type,
            model_type=model_type,
            hparam_mode=hparam_mode,
            outlier_rules=rules,
            manual_params=params,
            baseline_path=bl_path,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        logger.exception("Ошибка обучения (ручной пайплайн)")
        raise HTTPException(500, f"Ошибка обучения: {e}")

    return JSONResponse(result)


@app.get("/download-model/{model_id}")
async def download_model(model_id: str):
    logger.info("Скачивание модели: %s", model_id)
    data = get_model_bytes(model_id)
    if not data:
        raise HTTPException(404, "Модель не найдена")
    return StreamingResponse(
        BytesIO(data),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="model_{model_id}.pkl"'},
    )


@app.get("/download-steps/{model_id}")
async def download_steps(model_id: str):
    path = REPORTS_DIR / f"{model_id}_steps.json"
    if not path.exists():
        raise HTTPException(404, "Отчёт не найден")
    content = path.read_bytes()
    return StreamingResponse(
        BytesIO(content),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="pipeline_steps_{model_id}.json"'},
    )


@app.post("/favorite")
async def save_favorite(request: Request, data: dict = Body(...)):
    uid = _require_user(request)
    logger.info("Добавление в избранное: model_id=%s user=%s", data.get("model_id"), uid)
    try:
        entry = add_favorite(
            model_id=data["model_id"],
            task=data["task"],
            model_key=data["model_key"],
            model_label=data["model_label"],
            target=data["target"],
            metrics=data["metrics"],
            features_used=data["features_used"],
            filename=data["filename"],
            user_id=uid,
        )
    except FileNotFoundError:
        raise HTTPException(404, "Модель не найдена — невозможно добавить в избранное")
    return JSONResponse(entry)


@app.get("/favorites")
async def get_favorites(request: Request):
    uid = _require_user(request)
    return JSONResponse(list_favorites(uid))


@app.get("/download-favorite/{fav_id}")
async def download_favorite(request: Request, fav_id: str):
    uid = _require_user(request)
    logger.info("Скачивание избранной модели: %s user=%s", fav_id, uid)
    data = get_favorite_bytes(fav_id, uid)
    if not data:
        raise HTTPException(404, "Избранная модель не найдена")
    return StreamingResponse(
        BytesIO(data),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="favorite_{fav_id}.pkl"'},
    )


@app.delete("/favorite/{fav_id}")
async def delete_favorite(request: Request, fav_id: str):
    uid = _require_user(request)
    logger.info("Удаление из избранного: %s user=%s", fav_id, uid)
    if not remove_favorite(fav_id, uid):
        raise HTTPException(404, "Элемент не найден")
    return {"status": "deleted"}
