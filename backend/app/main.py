from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.api.auth import router as auth_router
from app.api.buildings import router as buildings_router
from app.api.courses import router as courses_router
from app.api.health import router as health_router
from app.api.messages import router as messages_router
from app.api.schedule import router as schedule_router
from app.api.semester import router as semester_router
from app.core.config import settings, validate_settings
from app.core.errors import BusinessError
from app.db.database import init_db
from app.schemas.error import BusinessErrorResponse


MAX_REQUEST_BODY_BYTES = 11 * 1024 * 1024


class RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    """Reject oversized bodies before multipart parsing or endpoint execution."""

    def __init__(self, app, max_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                declared_size = int(content_length)
            except ValueError:
                declared_size = 0
            if declared_size > self.max_bytes:
                await self._send_rejection(scope, receive, send)
                return

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise RequestBodyTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await self._send_rejection(scope, receive, send)

    async def _send_rejection(self, scope, receive, send) -> None:
        response = JSONResponse(
            status_code=413,
            content={
                "code": "request_too_large",
                "message": "请求内容过大",
                "fields": ["body"],
                "details": {"max_bytes": self.max_bytes},
            },
        )
        await response(scope, receive, send)


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


@app.exception_handler(BusinessError)
async def business_error_handler(
    request: Request,
    error: BusinessError,
) -> JSONResponse:
    _ = request
    return JSONResponse(status_code=error.status_code, content=error.as_response())


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    _ = request
    errors = [
        {
            "loc": list(item["loc"]),
            "msg": str(item["msg"]),
            "type": str(item["type"]),
        }
        for item in error.errors()
    ]
    fields = list(dict.fromkeys(str(item["loc"][-1]) for item in errors if item["loc"]))
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "message": "请求参数校验失败",
            "fields": fields,
            "details": {"errors": errors},
        },
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_allow_origins),
    # The web client keeps its rotating refresh token in an HttpOnly cookie.
    # Origins are explicit and never wildcarded, so credentialed CORS is safe.
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(RequestBodyLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(buildings_router)
app.include_router(messages_router)
app.include_router(courses_router)
app.include_router(schedule_router)
app.include_router(semester_router)


def custom_openapi() -> dict[str, object]:
    if app.openapi_schema is not None:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    components["BusinessErrorResponse"] = BusinessErrorResponse.model_json_schema()
    for path in schema["paths"].values():
        for operation in path.values():
            if not isinstance(operation, dict) or "responses" not in operation:
                continue
            response = operation["responses"].get("422")
            if response is not None:
                response["content"] = {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/BusinessErrorResponse"}
                    }
                }
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi
