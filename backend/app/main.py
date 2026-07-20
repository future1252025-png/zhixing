from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
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


app = FastAPI(title=settings.app_name)


@app.exception_handler(BusinessError)
async def business_error_handler(
    request: Request,
    error: BusinessError,
) -> JSONResponse:
    _ = request
    return JSONResponse(status_code=error.status_code, content=error.as_response())

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
