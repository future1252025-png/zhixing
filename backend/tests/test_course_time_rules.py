from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.semester import SemesterUpdate
from app.services.course_calendar import course_times_on
from tests.test_courses import auth_headers, client_and_session, course_payload, get_first_building_id

RULE = {"start_date": "2026-09-07", "end_date": "2026-09-30", "from_start": "14:00", "from_end": "15:40",
        "start_time": "14:30", "end_time": "16:10"}


def test_effective_dates_preserve_original_and_makeup_times():
    row = SimpleNamespace(start_time="14:00", end_time="15:40", makeup=None)
    setting = SimpleNamespace(time_rules=[{**RULE, "start_date": "2026-05-01"}])
    assert course_times_on(row, date(2026, 4, 30), setting) == ("14:00", "15:40")
    assert course_times_on(row, date(2026, 5, 1), setting) == ("14:30", "16:10")
    assert course_times_on(row, date(2026, 9, 30), setting) == ("14:30", "16:10")
    assert course_times_on(row, date(2026, 10, 1), setting) == ("14:00", "15:40")
    row.makeup = {"date": "2026-05-01"}
    assert course_times_on(row, date(2026, 5, 1), setting) == ("14:00", "15:40")


@pytest.mark.parametrize("rules", [[{**RULE, "start_time": "24:00"}], [{**RULE, "end_time": "13:00"}],
    [{**RULE, "start_date": "2026-02-30"}], [{**RULE, "end_date": "2026-01-01"}], [RULE, RULE]])
def test_invalid_rules_rejected(rules):
    with pytest.raises(ValidationError):
        SemesterUpdate(start_date="2026-08-31", total_weeks=20, time_rules=rules)


def save(client, headers, rules):
    return client.put('/api/semester', headers=headers, json={"start_date": "2026-08-31", "total_weeks": 20, "time_rules": rules})


def test_rules_persist_sync_and_old_clients_do_not_erase_them(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    result = save(client, headers, [RULE])
    assert result.status_code == 200, result.text
    assert result.json()['time_rules'] == [RULE]
    assert client.get('/api/semester', headers=headers).json()['time_rules'] == [RULE]
    assert client.put('/api/semester', headers=headers, json={"start_date": "2026-08-31", "total_weeks": 20}).json()['time_rules'] == [RULE]
    assert save(client, headers, []).json()['time_rules'] == []


def test_shift_conflicts_rollback_and_subsequent_course_writes_are_checked(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    building = get_first_building_id(client)
    afternoon = client.post('/api/courses', headers=headers, json=course_payload(building, start_time='14:00', end_time='15:40'))
    assert afternoon.status_code == 201
    later = client.post('/api/courses', headers=headers, json=course_payload(building, course_name='Java', start_time='15:55', end_time='17:35'))
    assert later.status_code == 201
    blocked = save(client, headers, [RULE])
    assert blocked.status_code == 409, blocked.text
    assert client.get('/api/semester', headers=headers).json()['time_rules'] == []
    rules = [RULE, {**RULE, 'from_start': '15:55', 'from_end': '17:35', 'start_time': '16:25', 'end_time': '18:05'}]
    assert save(client, headers, rules).status_code == 200
    assert client.get('/api/courses', headers=headers).json()[0]['start_time'] == '14:00'
    overlap = client.post('/api/courses', headers=headers, json=course_payload(building, course_name='日期冲突', start_time='15:45', end_time='15:50'))
    assert overlap.status_code == 409, overlap.text
    update = client.put(f"/api/courses/{later.json()['id']}", headers=headers, json={'start_time': '16:05', 'end_time': '17:30'})
    assert update.status_code == 409, update.text


def test_makeups_use_fixed_clocks_and_check_effective_regular_course_times(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    building = get_first_building_id(client)
    original = client.post('/api/courses', headers=headers, json=course_payload(building, start_time='14:00', end_time='15:40')).json()
    assert save(client, headers, [RULE]).status_code == 200
    payload = {'request_id': str(uuid4()), 'entries': [{'source_course_id': original['id'],
        'date': '2026-09-07', 'start_time': '15:45', 'end_time': '16:00'}]}
    # This time is free in the imported clocks but occupied after the date rule.
    conflict = client.post('/api/courses/makeups', headers=headers, json=payload)
    assert conflict.status_code == 409, conflict.text
    assert len(client.get('/api/courses', headers=headers).json()) == 1
    payload['entries'][0].update(date='2026-09-12', start_time='14:00', end_time='15:40')
    result = client.post('/api/courses/makeups', headers=headers, json=payload)
    assert result.status_code == 201, result.text
    assert result.json()[0]['start_time'] == '14:00'
    assert result.json()[0]['makeup']['date'] == '2026-09-12'


def test_import_batch_validates_effective_dates_instead_of_unshifted_pairs(client_and_session):
    from sqlalchemy import select
    from app.core.errors import BusinessError
    from app.models import User
    from app.schemas.course import CourseImportCreate
    from app.services.course_service import validate_course_batch
    from app.services.user_mutation_guard import acquire_user_mutation_guard

    client, sessions = client_and_session
    headers = auth_headers(client)
    building = get_first_building_id(client)
    assert save(client, headers, [{**RULE, 'start_date': '2026-08-31', 'end_date': None}]).status_code == 200
    afternoon = CourseImportCreate(**course_payload(building, start_time='14:00', end_time='15:40'))
    with sessions() as session:
        user = session.scalar(select(User).where(User.username == 'alice'))
        guard = acquire_user_mutation_guard(session, user.id)
        # Original pairs overlap, but actual dated times meet at 14:30, so this is valid.
        earlier = CourseImportCreate(**course_payload(building, start_time='13:30', end_time='14:30'))
        assert len(validate_course_batch(session, user_id=user.id, entries=[('a', afternoon), ('b', earlier)], guard=guard)) == 2
        later = CourseImportCreate(**course_payload(building, start_time='15:45', end_time='16:00'))
        with pytest.raises(BusinessError) as raised:
            validate_course_batch(session, user_id=user.id, entries=[('a', afternoon), ('b', later)], guard=guard)
        assert raised.value.code == 'course_conflict'
