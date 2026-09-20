from uuid import uuid4
from datetime import date

import pytest
from sqlalchemy import select

from tests.test_courses import auth_headers, client_and_session, course_payload, get_first_building_id
from app.models import Course, CourseMakeupRequest, User
from app.services.course_calendar import occurs_on
from app.services.semester_service import get_setting


def source(client, headers, **changes):
    response = client.post('/api/courses', headers=headers, json=course_payload(get_first_building_id(client), **changes))
    assert response.status_code == 201, response.text
    return response.json()


def batch(*entries):
    return {'request_id': str(uuid4()), 'entries': list(entries)}


def entry(course, **changes):
    return {'source_course_id': course['id'], 'date': '2026-09-19', 'start_time': course['start_time'],
            'end_time': course['end_time'], **changes}


def test_single_makeup_snapshot_retry_and_cancel(client_and_session):
    client, sessions = client_and_session
    headers = auth_headers(client)
    original = source(client, headers, start_time='14:30', end_time='16:10')
    payload = batch(entry(original))
    result = client.post('/api/courses/makeups', headers=headers, json=payload)
    assert result.status_code == 201, result.text
    makeup = result.json()[0]
    assert makeup['makeup']['date'] == '2026-09-19'
    assert makeup['weekday'] == 6
    assert makeup['start_time'] == '14:30'
    assert makeup['building_id'] == original['building_id']
    assert client.post('/api/courses/makeups', headers=headers, json=payload).json()[0]['id'] == makeup['id']
    changed = {**payload, 'entries': [entry(original, start_time='15:00', end_time='16:40')]}
    assert client.post('/api/courses/makeups', headers=headers, json=changed).status_code == 409
    assert client.post('/api/courses/makeups', headers=headers, json=batch(entry(original))).status_code == 409
    assert client.put(f"/api/courses/{original['id']}", headers=headers, json={'start_time': '14:40'}).status_code == 200
    courses = client.get('/api/courses', headers=headers).json()
    assert next(course for course in courses if course['id'] == makeup['id'])['start_time'] == '14:30'
    assert client.put(f"/api/courses/{makeup['id']}", headers=headers, json={'weekday': 3}).status_code == 422
    assert client.delete(f"/api/courses/{makeup['id']}", headers=headers).status_code == 204
    assert client.post('/api/courses/makeups', headers=headers, json=payload).status_code == 409
    assert len(client.get('/api/courses', headers=headers).json()) == 1


def test_batch_moves_only_original_dates_and_can_be_undone(client_and_session):
    client, sessions = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    two = source(client, headers, course_name='Afternoon', start_time='14:30', end_time='16:10')
    payload = batch(*(entry(course, source_date='2026-09-14', cancel_source=True) for course in [one, two]))
    response = client.post('/api/courses/makeups', headers=headers, json=payload)
    assert response.status_code == 201, response.text
    with sessions() as session:
        user = session.scalar(select(User).where(User.username == 'alice'))
        courses = list(session.scalars(select(Course).where(Course.user_id == user.id)).all())
        setting = get_setting(session, user.id)
        active = lambda day: [course for course in courses if occurs_on(course, date.fromisoformat(day), setting, courses)]
        assert len(active('2026-09-14')) == 0
        assert len(active('2026-09-19')) == 2
        assert len(active('2026-09-21')) == 2
        assert len(active('2026-09-26')) == 0
    assert client.delete(f"/api/courses/makeups/batches/{payload['request_id']}", headers=headers).status_code == 204
    assert len(client.get('/api/courses', headers=headers).json()) == 2
    assert client.delete(f"/api/courses/makeups/batches/{payload['request_id']}", headers=headers).status_code == 204


def test_batch_conflict_is_atomic_and_checks_active_source_date(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    two = source(client, headers, course_name='Afternoon', start_time='14:30', end_time='16:10')
    source(client, headers, course_name='Saturday occupied', weekday=6, start_time='15:00', end_time='17:00', weeks='3')
    response = client.post('/api/courses/makeups', headers=headers, json=batch(entry(one), entry(two)))
    assert response.status_code == 409
    assert '2026-09-19' in response.json()['message']
    assert len(client.get('/api/courses', headers=headers).json()) == 3
    assert client.post('/api/courses/makeups', headers=headers, json=batch(entry(one, source_date='2026-09-15'))).status_code == 409
    assert client.post('/api/courses/makeups', headers=headers, json=batch(entry(one, cancel_source=True))).status_code == 422


def test_makeup_blocks_regular_writes_in_its_week_not_other_weeks(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    assert client.post('/api/courses/makeups', headers=headers, json=batch(entry(one))).status_code == 201
    collision = course_payload(one['building_id'], weekday=6, weeks='3')
    assert client.post('/api/courses', headers=headers, json=collision).status_code == 409
    following = client.post('/api/courses', headers=headers, json={**collision, 'weeks': '4'})
    assert following.status_code == 201
    assert client.put(f"/api/courses/{following.json()['id']}", headers=headers, json={'weeks': '3'}).status_code == 409


def test_restore_checks_new_conflicts_before_removing_anything(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers, weeks='3')
    payload = batch(entry(one, source_date='2026-09-14', cancel_source=True))
    makeup = client.post('/api/courses/makeups', headers=headers, json=payload).json()[0]
    replacement = source(client, headers, course_name='New Monday class', weeks='3')
    assert client.delete(f"/api/courses/{makeup['id']}", headers=headers).status_code == 409
    assert client.delete(f"/api/courses/makeups/batches/{payload['request_id']}", headers=headers).status_code == 409
    assert len(client.get('/api/courses', headers=headers).json()) == 3
    client.delete(f"/api/courses/{replacement['id']}", headers=headers)
    assert client.delete(f"/api/courses/{makeup['id']}", headers=headers).status_code == 204


def test_unmapped_import_can_be_copied_and_location_change_does_not_keep_old_building(client_and_session):
    client, sessions = client_and_session
    headers = auth_headers(client)
    with sessions() as session:
        user = session.scalar(select(User).where(User.username == 'alice'))
        course = Course(user_id=user.id, course_name='Imported', weekday=1, weeks='2', source_kind='import',
                        start_time=None, end_time=None, building_id=None, room_name='教4-409', teacher='老师')
        session.add(course)
        session.commit()
        course_id = course.id
    payload = batch({'source_course_id': course_id, 'date': '2026-09-19', 'start_time': '14:30', 'end_time': '16:10'})
    response = client.post('/api/courses/makeups', headers=headers, json=payload)
    assert response.status_code == 201, response.text
    makeup = response.json()[0]
    assert makeup['building_id'] is None
    assert makeup['room_name'] == '教4-409'
    changed = client.put(f"/api/courses/makeups/{makeup['id']}", headers=headers,
        json={'date': '2026-09-20', 'start_time': '14:40', 'end_time': '16:20', 'location': '教3-201'})
    assert changed.status_code == 200
    assert changed.json()['source_location'] == '教3-201'
    assert changed.json()['building_id'] is None


@pytest.mark.parametrize('changes', [
    {'date': '2026-02-30'}, {'date': '2026-01-01'}, {'start_time': '24:00'},
    {'start_time': '09:40'}, {'location': '   '}, {'course_name': 'Not allowed'},
])
def test_rejects_invalid_makeup_payload(client_and_session, changes):
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    assert client.post('/api/courses/makeups', headers=headers, json=batch(entry(one, **changes))).status_code == 422
    assert len(client.get('/api/courses', headers=headers).json()) == 1


def test_ownership_and_account_erasure(client_and_session):
    client, sessions = client_and_session
    alice = auth_headers(client, 'alice')
    bob = auth_headers(client, 'bob')
    one = source(client, alice)
    payload = batch(entry(one))
    assert client.post('/api/courses/makeups', headers=bob, json=payload).status_code == 404
    created = client.post('/api/courses/makeups', headers=alice, json=payload).json()[0]
    assert client.put(f"/api/courses/makeups/{created['id']}", headers=bob,
        json={'date': '2026-09-20', 'start_time': '08:00', 'end_time': '09:40'}).status_code == 404
    assert client.delete(f"/api/courses/makeups/batches/{payload['request_id']}", headers=bob).status_code == 404
    from app.services.auth_service import delete_user_account
    with sessions() as session:
        user = session.scalar(select(User).where(User.username == 'alice'))
        delete_user_account(session, user)
        assert list(session.scalars(select(CourseMakeupRequest)).all()) == []


def test_semester_edit_does_not_shift_makeup_date(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    makeup = client.post('/api/courses/makeups', headers=headers, json=batch(entry(one))).json()[0]
    assert client.put('/api/semester', headers=headers, json={'start_date': '2026-08-24', 'total_weeks': 20}).status_code == 200
    saved = next(course for course in client.get('/api/courses', headers=headers).json() if course['id'] == makeup['id'])
    assert saved['makeup']['date'] == '2026-09-19'


def test_semester_shift_cannot_restore_conflicting_recurring_lessons(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers, weeks='3')
    assert client.post('/api/courses/makeups', headers=headers,
        json=batch(entry(one, source_date='2026-09-14', cancel_source=True))).status_code == 201
    source(client, headers, course_name='Replacement in vacated slot', weeks='3')
    response = client.put('/api/semester', headers=headers, json={'start_date': '2026-08-24', 'total_weeks': 20})
    assert response.status_code == 409
    assert client.get('/api/semester', headers=headers).json()['start_date'] == '2026-08-31'


def test_same_day_time_change_and_restore_only_touch_one_occurrence(client_and_session):
    client, sessions = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    response = client.post('/api/courses/makeups', headers=headers,
        json=batch(entry(one, date='2026-09-14', source_date='2026-09-14', cancel_source=True,
                         start_time='14:30', end_time='16:10')))
    assert response.status_code == 201, response.text
    makeup = response.json()[0]
    response = client.put(f"/api/courses/makeups/{makeup['id']}", headers=headers,
        json={'date': '2026-09-14', 'start_time': '14:40', 'end_time': '16:20'})
    assert response.status_code == 200, response.text
    with sessions() as session:
        user = session.scalar(select(User).where(User.username == 'alice'))
        courses = list(session.scalars(select(Course).where(Course.user_id == user.id)))
        setting = get_setting(session, user.id)
        assert [course.id for course in courses if occurs_on(course, date(2026, 9, 14), setting, courses)] == [makeup['id']]
        assert [course.id for course in courses if occurs_on(course, date(2026, 9, 21), setting, courses)] == [one['id']]
    assert client.delete(f"/api/courses/{makeup['id']}", headers=headers).status_code == 204
    assert client.get('/api/courses', headers=headers).json()[0]['start_time'] == one['start_time']


def test_cancelled_receipt_does_not_replay_a_reused_course_id(client_and_session):
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    payload = batch(entry(one))
    makeup = client.post('/api/courses/makeups', headers=headers, json=payload).json()[0]
    assert client.delete(f"/api/courses/{makeup['id']}", headers=headers).status_code == 204
    replacement = client.post('/api/courses/makeups', headers=headers, json=batch(entry(one))).json()[0]
    assert replacement['id'] == makeup['id']  # SQLite can reuse the last row id.
    assert client.post('/api/courses/makeups', headers=headers, json=payload).status_code == 409


@pytest.mark.parametrize('cancel_source', [False, True])
def test_reimport_preserves_snapshots_and_protects_dated_cancellations(client_and_session, cancel_source):
    from hashlib import sha256
    from tests.test_course_import import afternoon_import_content, commit_import_request
    client, _ = client_and_session
    headers = auth_headers(client)
    one = source(client, headers)
    makeup = client.post('/api/courses/makeups', headers=headers,
        json=batch(entry(one, source_date='2026-09-14', cancel_source=cancel_source))).json()[0]
    content = afternoon_import_content()
    response = commit_import_request(client, headers, content, digest=sha256(content).hexdigest())
    assert response.status_code == (409 if cancel_source else 201), response.text
    saved = client.get('/api/courses', headers=headers).json()
    assert next(course for course in saved if course['id'] == makeup['id'])['makeup'] == makeup['makeup']
    assert any(course['id'] == one['id'] for course in saved) == cancel_source
