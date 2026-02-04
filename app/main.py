from fastapi import FastAPI, Request, Body
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI()

app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/automatic-learning", response_class=HTMLResponse)
async def automl(request: Request):
    return templates.TemplateResponse("automatic_learning.html", {"request": request})

@app.get("/manual-learning", response_class=HTMLResponse)
async def manual_learning(request: Request):
    return templates.TemplateResponse("manual_learning.html", {"request": request})

@app.get("/profile", response_class=HTMLResponse)
async def profile(request: Request):
    return templates.TemplateResponse("profile.html", {"request": request})

@app.post("/train")
async def train_model(data: dict = Body(...)):
    print("TRAIN:", data)
    return {"status": "trained"}
