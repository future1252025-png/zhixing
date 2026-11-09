"""Verify deployed makeup HTTP handlers using a fresh, isolated database.

Run from the backend directory with its own Python interpreter. No live data,
accounts, signing keys or listening ports are used.
"""
import os
from pathlib import Path
import secrets
import sys
from tempfile import TemporaryDirectory
from uuid import uuid4


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    with TemporaryDirectory(prefix="campusmind-makeup-http-") as temporary:
        database = Path(temporary) / "isolated.sqlite3"
        os.environ["DATABASE_URL"] = f"sqlite:///{database.as_posix()}"
        os.environ["APP_ENV"] = "test"
        os.environ["JWT_SECRET_KEY"] = secrets.token_urlsafe(48)

        from fastapi.testclient import TestClient
        from sqlalchemy.orm import Session
        from app.core.config import settings
        from app.db.database import engine
        from app.db.seed import seed_demo_data
        from app.main import app

        assert settings.database_url == os.environ["DATABASE_URL"]

        def check(response, status):
            assert response.status_code == status, (response.status_code, response.text)
            return response.json() if response.content else None

        try:
            with TestClient(app) as client:
                with Session(engine) as session:
                    seed_demo_data(session)
                credentials = {"student_id": "makeup-smoke", "password": secrets.token_urlsafe(24)}
                check(client.post("/api/auth/register", json={**credentials, "nickname": "Smoke test"}), 201)
                token = check(client.post("/api/auth/login", json=credentials), 200)["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
                check(client.put("/api/semester", headers=headers,
                    json={"start_date": "2026-08-31", "total_weeks": 20}), 200)
                building = check(client.get("/api/buildings"), 200)[0]["id"]
                originals = []
                for name, start, end in [("Morning", "08:00", "09:40"), ("Afternoon", "14:30", "16:10")]:
                    originals.append(check(client.post("/api/courses", headers=headers, json={
                        "course_name": name, "weekday": 1, "weeks": "1-16",
                        "start_time": start, "end_time": end, "building_id": building, "room_name": "409",
                    }), 201))
                entries = [{"source_course_id": course["id"], "date": "2026-09-19",
                    "start_time": course["start_time"], "end_time": course["end_time"]} for course in originals]
                payload = {"request_id": str(uuid4()), "entries": [entries[1]]}
                single = check(client.post("/api/courses/makeups", headers=headers, json=payload), 201)[0]
                assert single["makeup"]["date"] == "2026-09-19"
                assert check(client.post("/api/courses/makeups", headers=headers, json=payload), 201)[0]["id"] == single["id"]
                check(client.post("/api/courses/makeups", headers=headers,
                    json={**payload, "request_id": str(uuid4())}), 409)
                edited = check(client.put(f"/api/courses/makeups/{single['id']}", headers=headers,
                    json={"date": "2026-09-20", "start_time": "14:40", "end_time": "16:20", "location": "Room 503"}), 200)
                assert edited["start_time"] == "14:40" and edited["source_location"] == "Room 503"
                check(client.delete(f"/api/courses/{single['id']}", headers=headers), 204)
                batch = {"request_id": str(uuid4()), "entries": [
                    {**entry, "source_date": "2026-09-14", "cancel_source": True} for entry in entries]}
                added = check(client.post("/api/courses/makeups", headers=headers, json=batch), 201)
                assert len(added) == 2 and all(row["makeup"]["cancel_source"] for row in added)
                check(client.delete(f"/api/courses/makeups/batches/{batch['request_id']}", headers=headers), 204)
                assert check(client.get("/api/courses", headers=headers), 200) == originals
                check(client.post("/api/courses/makeups", json=batch), 401)
                print("MAKEUP_HTTP_CREATE_RETRY_CONFLICT_EDIT_CANCEL_BATCH_AUTH_OK")
        finally:
            engine.dispose()


if __name__ == "__main__":
    main()
