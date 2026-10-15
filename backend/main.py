from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from configs.db import check_connection, init_db
from routes.candidates import router as candidates_router
from routes.messages import router as messages_router
from routes.provider import router as provider_router
from routes.templates import router as templates_router
from routes.webhooks import router as webhooks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Candidate Communication Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(candidates_router)
app.include_router(messages_router)
app.include_router(templates_router)
app.include_router(webhooks_router)
app.include_router(provider_router)


@app.get("/")
async def root():
    return {"message": "Hello, FastAPI!"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/health/db")
async def db_health_check():
    try:
        check_connection()
        return {"status": "ok", "db": "connected"}
    except Exception as exc:
        return {"status": "error", "db": "unreachable", "detail": str(exc)}
