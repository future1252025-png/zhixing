from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": "智行 CampusMind API",
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
