from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import select

from app.models import ReminderPlan
from tests.test_semester import auth_headers, client_and_session  # noqa: F401


def plan():
    return {
        "revision": 0,
        "course_settings": {"enabled": True, "lead_minutes": 10, "mode": "vibrate"},
        "items": [{"id": "homework-1", "title": "  提交作业  ", "date": "2026-09-21", "time": "14:30"}],
    }


def test_reminder_plan_requires_auth_and_is_private(client_and_session):
    client, _ = client_and_session
    assert client.get("/api/reminders").status_code == 401
    assert client.put("/api/reminders", json=plan()).status_code == 401
    alice = auth_headers(client, "reminder-alice")
    bob = auth_headers(client, "reminder-bob")
    assert client.get("/api/reminders", headers=alice).json()["revision"] == 0
    saved = client.put("/api/reminders", headers=alice, json=plan())
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    assert saved.json()["items"][0]["title"] == "提交作业"
    assert client.get("/api/reminders", headers=bob).json()["items"] == []
    assert client.get("/api/reminders", headers=alice).json() == saved.json()


def test_stale_revision_cannot_overwrite_another_device(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client, "reminder-conflict")
    saved = client.put("/api/reminders", headers=headers, json=plan()).json()
    stale = client.put("/api/reminders", headers=headers, json=plan())
    assert stale.status_code == 409
    assert "reminder_revision_conflict" in stale.text
    saved["items"] = []
    assert client.put("/api/reminders", headers=headers, json=saved).json()["revision"] == 2
    assert client.get("/api/reminders", headers=headers).json()["items"] == []


def test_simultaneous_first_save_only_one_revision_wins(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client, "reminder-race")
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.put("/api/reminders", headers=headers, json=plan()), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert client.get("/api/reminders", headers=headers).json()["revision"] == 1


@pytest.mark.parametrize("changes", [
    {"time": "24:00"}, {"time": "2:30"}, {"date": "2026-02-30"}, {"date": 1789920000},
    {"title": "   "}, {"repeat": "weekly"}, {"repeat": "daily", "end_date": "2028-09-21"},
    {"repeat": "daily", "end_date": "2026-09-20"}, {"end_date": "2026-09-21"},
    {"weekdays": [1, 1]}, {"weekdays": [0]}, {"weekdays": [True]},
    {"enabled": "true"}, {"mode": "alarm"}, {"id": "../not-an-id"},
    {"completed_dates": ["2026-09-21", "2026-09-21"]}, {"completed_dates": [1789920000]},
    {"user_id": 42},
])
def test_invalid_items_never_persist(client_and_session, changes):
    client, _ = client_and_session
    headers = auth_headers(client, "reminder-validation")
    payload = plan()
    payload["items"][0].update(changes)
    assert client.put("/api/reminders", headers=headers, json=payload).status_code == 422
    assert client.get("/api/reminders", headers=headers).json()["revision"] == 0


@pytest.mark.parametrize("changes", [
    {"revision": True}, {"user_id": 42}, {"course_settings": {"lead_minutes": -1}},
    {"course_settings": {"lead_minutes": 121}}, {"items": plan()["items"] * 2},
    {"items": [{**plan()["items"][0], "id": f"item-{i}"} for i in range(101)]},
])
def test_invalid_plans_never_persist(client_and_session, changes):
    client, _ = client_and_session
    headers = auth_headers(client, "reminder-invalid-plan")
    payload = plan()
    payload.update(deepcopy(changes))
    assert client.put("/api/reminders", headers=headers, json=payload).status_code == 422


def test_repeat_completion_and_account_deletion(client_and_session):
    client, sessions = client_and_session
    headers = auth_headers(client, "reminder-delete")
    payload = plan()
    payload["items"][0].update(repeat="weekly", weekdays=[1, 3], end_date="2026-10-21", completed_dates=["2026-09-21"])
    saved = client.put("/api/reminders", headers=headers, json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["items"][0]["completed_dates"] == ["2026-09-21"]
    deleted = client.request("DELETE", "/api/auth/me", headers=headers, json={"password": "secret123"})
    assert deleted.status_code == 204
    with sessions() as session:
        assert session.scalars(select(ReminderPlan)).all() == []
