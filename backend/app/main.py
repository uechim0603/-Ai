from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.models.database import init_db
from app.api.routes.meetings import router as meetings_router
from app.api.routes.recording import router as recording_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="MeetFlow API",
    description="会議の意思決定を加速させるAI議事録システム",
    version="0.1.0",
    lifespan=lifespan,
)

# FRONTEND_URL はカンマ区切りで複数指定可能
_origins = [o.strip() for o in settings.frontend_url.split(",") if o.strip()]
if "http://localhost:3000" not in _origins:
    _origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings_router, prefix="/api/v1")
app.include_router(recording_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
