from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from app.api.auth import router as auth_router
from app.api.buildings import router as buildings_router
from app.api.courses import router as courses_router
from app.api.health import router as health_router
from app.api.messages import router as messages_router
from app.api.schedule import router as schedule_router
from app.api.semester import router as semester_router
from app.core.config import settings
from app.core.errors import BusinessError
from app.schemas.error import BusinessErrorResponse


app = FastAPI(title=settings.app_name)


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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
