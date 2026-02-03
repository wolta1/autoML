from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI()

app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {"request": request}
    )

@app.get("/automatic-learning", response_class=HTMLResponse)
async def automatic_learning(request: Request):
    return templates.TemplateResponse(
        "automatic_learning.html",
        {"request": request}
    )