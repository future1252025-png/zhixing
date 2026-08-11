from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.database import get_session
from app.main import MAX_REQUEST_BODY_BYTES, app


def test_health_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": "智行 CampusMind API",
    }


def test_ready_executes_database_probe() -> None:
    class HealthySession:
        executed = False

        def execute(self, _statement) -> None:
            self.executed = True

    session = HealthySession()
    app.dependency_overrides[get_session] = lambda: session
    try:
        response = TestClient(app).get("/ready")
    finally:
        app.dependency_overrides.pop(get_session, None)

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "app": "智行 CampusMind API",
    }
    assert session.executed is True


def test_ready_returns_structured_503_when_database_is_unavailable() -> None:
    class BrokenSession:
        def execute(self, _statement) -> None:
            raise OperationalError("SELECT 1", {}, RuntimeError("offline"))

    app.dependency_overrides[get_session] = lambda: BrokenSession()
    try:
        response = TestClient(app).get("/ready")
    finally:
        app.dependency_overrides.pop(get_session, None)

    assert response.status_code == 503
    assert response.json() == {
        "code": "database_unavailable",
        "message": "数据库暂时不可用，请稍后重试",
        "fields": [],
        "details": {},
    }


def test_cors_allows_local_frontend_origin() -> None:
    client = TestClient(app)

    for origin in (
        "https://localhost",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5179",
    ):
        response = client.options(
            "/api/auth/register",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,authorization",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_oversized_request_is_rejected_before_endpoint_parsing() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/auth/register",
        content=b"{}",
        headers={"Content-Length": str(MAX_REQUEST_BODY_BYTES + 1)},
    )

    assert response.status_code == 413
    assert response.json()["code"] == "request_too_large"
    assert response.json()["details"]["max_bytes"] == MAX_REQUEST_BODY_BYTES
