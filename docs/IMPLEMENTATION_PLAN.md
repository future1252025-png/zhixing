# 智行 CampusMind MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before claiming any task is complete, use `superpowers:verification-before-completion`.

**Goal:** Build a runnable mobile H5/PWA MVP for 智行 CampusMind that supports login, campus buildings, HTTP building messages, course management, next-course detection, and departure suggestions.

**Architecture:** Vue 3 + Vite + Vant UI runs the mobile frontend. FastAPI exposes HTTP JSON APIs, SQLAlchemy persists to SQLite, and rule-based schedule/location logic powers departure suggestions. The first version explicitly excludes WebSocket, real map SDK, real AI API, complete admin backend, and push notifications.

**Tech Stack:** Vue 3, Vite, Vant UI, TypeScript or JavaScript, FastAPI, SQLAlchemy, SQLite, Pytest, JWT.

---

## 1. Implementation Rules

- Implement in small phases. Each phase must leave the project in a runnable or at least verifiable state.
- Do not introduce WebSocket, real AI API, real map SDK, full admin backend, report workflow, or push notification features.
- Prefer simple, explicit files over large mixed-responsibility files.
- Keep backend and frontend runnable independently.
- Use verification evidence before claiming completion.
- Current planning stage does not implement code. These tasks are for the later executing-plans stage.

## 2. Planned File Map

### 2.1 Backend Planned Structure

```text
backend/
  app/
    main.py
    core/
      config.py
      security.py
    db/
      session.py
      base.py
      seed.py
    models/
      user.py
      building.py
      course.py
      message.py
      location_preset.py
    schemas/
      auth.py
      building.py
      course.py
      message.py
      schedule.py
      common.py
    routers/
      auth.py
      buildings.py
      courses.py
      messages.py
      schedule.py
      location_presets.py
    services/
      auth_service.py
      schedule_service.py
      location_service.py
    tests/
      test_auth.py
      test_courses.py
      test_schedule.py
      test_messages.py
  requirements.txt
```

### 2.2 Frontend Planned Structure

```text
frontend/
  src/
    main.ts
    App.vue
    router/
      index.ts
    api/
      request.ts
      auth.ts
      buildings.ts
      courses.ts
      messages.ts
      schedule.ts
    stores/
      auth.ts
    views/
      LoginView.vue
      RegisterView.vue
      HomeView.vue
      BuildingDetailView.vue
      BuildingMessagesView.vue
      CoursesView.vue
      CourseEditView.vue
      ScheduleView.vue
      ProfileView.vue
    components/
      AppTabbar.vue
      EmptyState.vue
      LoadingState.vue
      BuildingCard.vue
      CourseCard.vue
      SuggestionCard.vue
    utils/
      location.ts
      time.ts
  package.json
```

## 3. Phase 0: Workspace And Baseline Check

**Goal:** Confirm repository state and decide exact package commands before implementation.

**Tasks:**

- [ ] Review `docs/PROJECT_SPEC.md`, `docs/MVP_SCOPE.md`, `docs/ARCHITECTURE_OVERVIEW.md`, and `docs/NON_GOALS.md`.
- [ ] Confirm `backend/` and `frontend/` are empty or only contain placeholders.
- [ ] Confirm no uncommitted user changes would be overwritten.
- [ ] Record chosen frontend language: TypeScript preferred if the generated Vite template supports it cleanly; JavaScript acceptable for speed.

**Files involved:**

- Read: `README.md`
- Read: `docs/*.md`
- Read: `backend/`
- Read: `frontend/`

**Verification commands:**

```powershell
git status --short --branch
Get-ChildItem -Force backend
Get-ChildItem -Force frontend
```

**Acceptance criteria:**

- Implementation starts from a known clean or intentionally dirty state.
- Any existing user changes are preserved.
- Scope remains aligned with `docs/NON_GOALS.md`.

## 4. Phase 1: Backend Project Skeleton

**Goal:** Create a minimal FastAPI app that starts successfully and exposes health/API docs.

**Tasks:**

- [ ] Create backend Python dependency file.
- [ ] Create `backend/app/main.py` with FastAPI app factory or app instance.
- [ ] Add CORS configuration for the local frontend dev server.
- [ ] Add `/api/health` endpoint.
- [ ] Add backend test setup.
- [ ] Verify backend starts.

**Files involved:**

- Create: `backend/requirements.txt`
- Create: `backend/app/main.py`
- Create: `backend/app/schemas/common.py`
- Create: `backend/app/tests/test_health.py`

**Verification commands:**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\pytest
.\.venv\Scripts\uvicorn app.main:app --reload
```

**Manual acceptance:**

- `GET http://127.0.0.1:8000/api/health` returns success.
- `http://127.0.0.1:8000/docs` opens.

## 5. Phase 2: Database Models And Seed Data

**Goal:** Implement SQLite persistence and seed data for demo buildings, location presets, user, messages, and courses.

**Tasks:**

- [ ] Add SQLAlchemy database session and base metadata.
- [ ] Implement models for `users`, `buildings`, `courses`, `messages`, and `location_presets`.
- [ ] Add database initialization helper.
- [ ] Add seed data that matches `docs/DEMO_PLAN.md`.
- [ ] Add tests that initialize a temporary SQLite database and verify seeded counts.

**Files involved:**

- Create: `backend/app/db/session.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/seed.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/building.py`
- Create: `backend/app/models/course.py`
- Create: `backend/app/models/message.py`
- Create: `backend/app/models/location_preset.py`
- Test: `backend/app/tests/test_seed.py`

**Verification commands:**

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_seed.py -v
.\.venv\Scripts\pytest -v
```

**Acceptance criteria:**

- Tables can be created in a fresh SQLite database.
- Seed data includes at least 8 buildings, one demo user, demo courses, demo messages, and location presets.

## 6. Phase 3: Auth API

**Goal:** Implement registration, login, JWT issuance, password hashing, and current-user dependency.

**Tasks:**

- [ ] Add password hashing utilities.
- [ ] Add JWT creation and decoding utilities.
- [ ] Add auth schemas.
- [ ] Add auth router with register, login, and me endpoints.
- [ ] Add tests for successful register/login, duplicate username, invalid password, and protected `/me`.

**Files involved:**

- Create: `backend/app/core/security.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/services/auth_service.py`
- Create: `backend/app/routers/auth.py`
- Modify: `backend/app/main.py`
- Test: `backend/app/tests/test_auth.py`

**Verification commands:**

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_auth.py -v
.\.venv\Scripts\pytest -v
.\.venv\Scripts\uvicorn app.main:app --reload
```

**Manual acceptance:**

- Swagger can call register and login.
- Login response includes token and user info.
- Protected endpoint rejects missing token.

## 7. Phase 4: Buildings, Messages, Courses, And Schedule APIs

**Goal:** Implement all P0 backend APIs required by the mobile frontend.

**Tasks:**

- [ ] Implement building list/detail endpoints.
- [ ] Implement building message list/create endpoints.
- [ ] Implement course CRUD endpoints scoped to current user.
- [ ] Implement location preset list endpoint.
- [ ] Implement schedule next-course endpoint.
- [ ] Implement departure suggestion endpoint.
- [ ] Add tests for each module.

**Files involved:**

- Create: `backend/app/schemas/building.py`
- Create: `backend/app/schemas/message.py`
- Create: `backend/app/schemas/course.py`
- Create: `backend/app/schemas/schedule.py`
- Create: `backend/app/routers/buildings.py`
- Create: `backend/app/routers/messages.py`
- Create: `backend/app/routers/courses.py`
- Create: `backend/app/routers/schedule.py`
- Create: `backend/app/routers/location_presets.py`
- Create: `backend/app/services/location_service.py`
- Create: `backend/app/services/schedule_service.py`
- Modify: `backend/app/main.py`
- Test: `backend/app/tests/test_messages.py`
- Test: `backend/app/tests/test_courses.py`
- Test: `backend/app/tests/test_schedule.py`

**Verification commands:**

```powershell
cd backend
.\.venv\Scripts\pytest app/tests/test_messages.py -v
.\.venv\Scripts\pytest app/tests/test_courses.py -v
.\.venv\Scripts\pytest app/tests/test_schedule.py -v
.\.venv\Scripts\pytest -v
```

**Manual acceptance:**

- Swagger lists all P0 endpoints.
- Authenticated user can create a course and get a departure suggestion.
- Building messages can be read and posted via HTTP.

## 8. Phase 5: Frontend Project Skeleton

**Goal:** Create Vue 3 + Vite + Vant UI app with routing, tab bar, request wrapper, and auth state.

**Tasks:**

- [ ] Create Vite project under `frontend/`.
- [ ] Install Vant and routing dependencies.
- [ ] Create mobile-first layout and routes.
- [ ] Implement request wrapper with token injection.
- [ ] Implement auth store or composable.
- [ ] Add placeholder pages for all P0 routes.
- [ ] Verify dev server and production build.

**Files involved:**

- Create: `frontend/package.json`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/App.vue`
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/api/request.ts`
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/components/AppTabbar.vue`
- Create: `frontend/src/views/*.vue`

**Verification commands:**

```powershell
cd frontend
npm install
npm run dev
npm run build
```

**Manual acceptance:**

- Mobile viewport can navigate between placeholder pages.
- Build exits with code 0.
- No page references WebSocket, admin backend, real AI, or real map SDK.

## 9. Phase 6: Frontend Feature Pages

**Goal:** Implement the mobile screens and connect them to the backend P0 APIs.

**Tasks:**

- [ ] Implement login and register flows.
- [ ] Implement home/building list.
- [ ] Implement building detail.
- [ ] Implement building messages.
- [ ] Implement courses list and edit form.
- [ ] Implement schedule suggestion page.
- [ ] Implement location selection fallback.
- [ ] Add loading, empty, and error states.

**Files involved:**

- Modify: `frontend/src/views/LoginView.vue`
- Modify: `frontend/src/views/RegisterView.vue`
- Modify: `frontend/src/views/HomeView.vue`
- Modify: `frontend/src/views/BuildingDetailView.vue`
- Modify: `frontend/src/views/BuildingMessagesView.vue`
- Modify: `frontend/src/views/CoursesView.vue`
- Modify: `frontend/src/views/CourseEditView.vue`
- Modify: `frontend/src/views/ScheduleView.vue`
- Modify: `frontend/src/api/*.ts`
- Create/Modify: `frontend/src/utils/location.ts`
- Create/Modify: `frontend/src/components/*.vue`

**Verification commands:**

```powershell
cd frontend
npm run build
npm run dev
```

**Manual acceptance:**

- A user can follow the full flow in `docs/USER_FLOW.md`.
- UI fits a mobile viewport.
- Location failure path shows manual location selection.

## 10. Phase 7: Integration, Demo, And Documentation Update

**Goal:** Verify the full MVP, document how to run it, and prepare demo materials.

**Tasks:**

- [ ] Run backend and frontend together.
- [ ] Execute full manual demo flow.
- [ ] Run backend test suite.
- [ ] Run frontend build.
- [ ] Update README with run commands.
- [ ] Update demo notes if implementation differs from plan.
- [ ] Complete acceptance checklist.

**Files involved:**

- Modify: `README.md`
- Modify: `docs/DEMO_PLAN.md` if demo data changes.
- Modify: `docs/ACCEPTANCE_CHECKLIST.md` if acceptance details change.

**Verification commands:**

```powershell
cd backend
.\.venv\Scripts\pytest -v
.\.venv\Scripts\uvicorn app.main:app --reload
```

```powershell
cd frontend
npm run build
npm run dev
```

**Manual acceptance:**

- Run through `docs/DEMO_PLAN.md` from start to finish.
- Confirm all items in `docs/ACCEPTANCE_CHECKLIST.md`.

