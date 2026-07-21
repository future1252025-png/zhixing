from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.auth import router as auth_router
from app.api.buildings import router as buildings_router
from app.api.courses import router as courses_router
from app.api.health import router as health_router
from app.api.messages import router as messages_router
from app.api.schedule import router as schedule_router
from app.core.config import settings, validate_settings
from app.db.database import init_db


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    validate_settings()
    # Ensure tables/schema exist; seed data is still an explicit CLI step.
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_allow_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(buildings_router)
app.include_router(messages_router)
app.include_router(courses_router)
app.include_router(schedule_router)
