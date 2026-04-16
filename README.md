# autoML

Дипломная работа студентки группы ВМО41.

Веб-приложение на FastAPI: автоматическое и ручное обучение моделей. Метаданные моделей и избранного хранятся в **PostgreSQL**, файлы `.pkl` — в **S3-совместимом MinIO**.

---

## Требования

- **Python 3.11+** (рекомендуется 3.12/3.13)
- **Docker Desktop** (для PostgreSQL и MinIO)

---

## 1. Запуск инфраструктуры (PostgreSQL + MinIO)

В корне репозитория:

```bash
docker compose up -d
```

Проверка, что контейнеры работают:

```bash
docker compose ps
```

Должны быть в статусе `Up` сервисы `postgres` и `minio`.

---

## 2. Установка зависимостей и запуск приложения

Создайте виртуальное окружение (по желанию), затем:

```bash
pip install -r requirements.txt
```

Запуск API из **корня репозитория** (чтобы пути `app/...` совпадали). В этом проекте по умолчанию используется порт **8001** (на Windows порт **8000** часто занят, в том числе компонентами Docker).

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Через виртуальное окружение в Windows (PowerShell), из корня репозитория:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Откройте в браузере: [http://127.0.0.1:8001](http://127.0.0.1:8001) (главная).

Страница входа: [http://127.0.0.1:8001/login](http://127.0.0.1:8001/login). В адресе не должно быть пробелов и текста `{"detail":...}` — это тело ответа **404**, его в строку браузера подставлять не нужно.

Если при открытии `/login` видите JSON `Not Found`: перезапустите приложение из **корня репозитория** командой выше и убедитесь, что на **8001** не висит другой старый процесс (в PowerShell: `netstat -ano | findstr :8001`).

> **Другой порт:** замените `8001` на нужный номер в команде `uvicorn` и в URL в браузере (например `8000`, если он свободен).

---

## Переменные окружения (опционально)

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `DATABASE_URL` | `postgresql://automl:automl_pass@localhost:5432/automl` | Подключение к PostgreSQL |
| `S3_ENDPOINT` | `http://localhost:9000` | Endpoint MinIO (S3 API) |
| `S3_ACCESS_KEY` | `minioadmin` | Ключ доступа MinIO |
| `S3_SECRET_KEY` | `minioadmin` | Секретный ключ MinIO |
| `S3_BUCKET` | `automl-models` | Имя бакета для `.pkl` |
| `SESSION_SECRET` | (встроенный dev-ключ) | Секрет подписи cookie-сессий; |

Бакет создаётся автоматически при первом обращении приложения к S3.

### Авторизация

- Страница входа и регистрации: **`/login`** (логин + пароль). Пароль в БД хранится только в виде **bcrypt-хеша** (таблица `users`).
- **`/profile`** без сессии перенаправляет на `/login?next=/profile`.
- Избранное привязано к пользователю (`favorites.user_id`); добавление в избранное требует входа.

---

## Как посмотреть объекты в S3 (MinIO)

1. Убедитесь, что контейнер MinIO запущен (`docker compose up -d`).
2. Откройте **веб-консоль MinIO**: [http://localhost:9001](http://localhost:9001).
3. Войдите:
   - **User:** `minioadmin`
   - **Password:** `minioadmin`
4. В меню **Buckets** найдите бакет **`automl-models`** (появится после первого сохранения модели).
5. Внутри бакета объекты лежат по префиксу **`models/`** (файлы вида `models/<model_id>.pkl`).

API S3 для клиентов и приложения: [http://localhost:9000](http://localhost:9000).

---

## Как посмотреть таблицы в PostgreSQL

Параметры из `docker-compose.yml`:

| Параметр | Значение |
|----------|----------|
| Хост | `localhost` |
| Порт | `5432` |
| База | `automl` |
| Пользователь | `automl` |
| Пароль | `automl_pass` |

### Через Docker (без установки `psql` на ПК)

```bash
docker compose exec postgres psql -U automl -d automl
```

В интерактивной сессии `psql`:

```sql
\dt
SELECT id, username, created_at FROM users LIMIT 10;
SELECT * FROM trained_models LIMIT 10;
SELECT * FROM favorites LIMIT 10;
\q
```

Основные таблицы:

- **`users`** — зарегистрированные пользователи (`username`, `password_hash` — только хеш bcrypt).
- **`trained_models`** — обученные модели (метаданные, ссылка на ключ в S3 в поле `s3_key`).
- **`favorites`** — избранное пользователя (`user_id`, `s3_key` и метаданные карточки).

### Через GUI

Подключитесь любым клиентом (DBeaver, pgAdmin, DataGrip) по строке:

`postgresql://automl:automl_pass@localhost:5432/automl`

---

## Полезные страницы приложения

| URL | Описание |
|-----|----------|
| `/` | Главная |
| `/automatic-learning` | Автоматическое обучение |
| `/manual-learning` | Ручное обучение |
| `/login` | Вход и регистрация |
| `/profile` | Личный кабинет (после входа: избранное, настройки аккаунта) |

Остановка контейнеров:

```bash
docker compose down
```

Данные БД и MinIO сохраняются в именованных томах Docker до выполнения `docker compose down -v` (флаг `-v` удалит тома и все данные).
