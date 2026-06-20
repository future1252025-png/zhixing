# Anime.js Launch and Login Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time Anime.js launch animation and a non-skippable login-success route-ticket animation that hands off smoothly to the real home course ticket.

**Architecture:** Keep animation persistence and course-snapshot preparation in pure utilities covered by Vitest. `App.vue` is the only animation orchestrator, while focused launch and login overlay components own their Anime.js timelines and cleanup. Login prefetch is best-effort and never changes authentication or navigation outcomes.

**Tech Stack:** Vue 3, TypeScript, Anime.js 4, Vue Router, Vant, Vitest, localStorage, sessionStorage

---

## File Map

- Create `frontend/src/components/AppLaunchIntro.vue`: one-time 0.9-second launch overlay.
- Modify `frontend/src/components/LoginWelcomeIntro.vue`: 1.8-second route-ticket timeline with optional real course snapshot.
- Modify `frontend/src/utils/loginIntro.ts`: launch state, login state, snapshot validation, and best-effort course preparation.
- Modify `frontend/src/utils/loginIntro.test.ts`: persistence, snapshot, invalid-data, success, and failure tests.
- Modify `frontend/src/pages/LoginPage.vue`: prepare the animation snapshot after authentication and before navigation.
- Modify `frontend/src/App.vue`: serialize launch and login overlays and coordinate home handoff.
- Modify `frontend/src/styles/base.css`: home ticket entrance and reduced-motion behavior.

## Task 1: Versioned Launch State and Login Snapshot Storage

**Files:**
- Modify: `frontend/src/utils/loginIntro.ts`
- Test: `frontend/src/utils/loginIntro.test.ts`

- [ ] **Step 1: Add failing tests for one-time launch state and snapshot consumption**

Replace the current import from `./loginIntro` with this combined import, then append the tests:

```ts
import {
  APP_LAUNCH_INTRO_STORAGE_KEY,
  LOGIN_INTRO_STORAGE_KEY,
  LOGIN_INTRO_SNAPSHOT_STORAGE_KEY,
  consumeLoginIntroFlag,
  consumeLoginIntroSnapshot,
  markLoginIntroPending,
  shouldPlayAppLaunchIntro
} from './loginIntro'

it('plays the current launch animation version once', () => {
  const storage = createStorage()

  expect(shouldPlayAppLaunchIntro(storage)).toBe(true)
  expect(storage.getItem(APP_LAUNCH_INTRO_STORAGE_KEY)).toBe('1')
  expect(shouldPlayAppLaunchIntro(storage)).toBe(false)
})

it('stores and consumes a login course snapshot once', () => {
  const storage = createStorage()
  const snapshot = {
    courseName: '数据库原理',
    startTime: '14:00',
    buildingName: '教4',
    roomName: '102'
  }

  markLoginIntroPending(storage, snapshot)

  expect(consumeLoginIntroSnapshot(storage)).toEqual(snapshot)
  expect(storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)).toBeNull()
  expect(consumeLoginIntroSnapshot(storage)).toBeNull()
})

it('discards malformed login snapshots', () => {
  const storage = createStorage()
  storage.setItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY, '{bad json')

  expect(consumeLoginIntroSnapshot(storage)).toBeNull()
  expect(storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)).toBeNull()
})
```

- [ ] **Step 2: Run the tests and confirm the new API is missing**

Run:

```bash
cd frontend
npm test -- src/utils/loginIntro.test.ts
```

Expected: FAIL because `APP_LAUNCH_INTRO_STORAGE_KEY`, `shouldPlayAppLaunchIntro`, and snapshot helpers are not exported.

- [ ] **Step 3: Implement storage primitives and strict snapshot validation**

Replace `frontend/src/utils/loginIntro.ts` with:

```ts
import type { Course } from '@/types/course'

export const APP_LAUNCH_INTRO_STORAGE_KEY = 'campusmind-launch-intro-seen-v1'
export const LOGIN_INTRO_STORAGE_KEY = 'campusmind-login-intro-pending'
export const LOGIN_INTRO_SNAPSHOT_STORAGE_KEY = 'campusmind-login-intro-snapshot'

export type LoginIntroSnapshot = {
  courseName: string
  startTime: string
  buildingName: string
  roomName: string
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isLoginIntroSnapshot(value: unknown): value is LoginIntroSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Record<string, unknown>
  return (
    typeof snapshot.courseName === 'string' &&
    typeof snapshot.startTime === 'string' &&
    typeof snapshot.buildingName === 'string' &&
    typeof snapshot.roomName === 'string'
  )
}

export function shouldPlayAppLaunchIntro(storage: StorageLike = localStorage): boolean {
  if (storage.getItem(APP_LAUNCH_INTRO_STORAGE_KEY) === '1') return false
  storage.setItem(APP_LAUNCH_INTRO_STORAGE_KEY, '1')
  return true
}

export function buildLoginIntroSnapshot(course: Course | null): LoginIntroSnapshot | null {
  if (!course) return null
  return {
    courseName: course.course_name,
    startTime: course.start_time,
    buildingName: course.building.name,
    roomName: course.room_name
  }
}

export function markLoginIntroPending(
  storage: StorageLike = sessionStorage,
  snapshot: LoginIntroSnapshot | null = null
): void {
  storage.setItem(LOGIN_INTRO_STORAGE_KEY, '1')
  if (snapshot) {
    storage.setItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  } else {
    storage.removeItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  }
}

export function consumeLoginIntroFlag(storage: StorageLike = sessionStorage): boolean {
  const pending = storage.getItem(LOGIN_INTRO_STORAGE_KEY) === '1'
  if (pending) storage.removeItem(LOGIN_INTRO_STORAGE_KEY)
  return pending
}

export function consumeLoginIntroSnapshot(
  storage: StorageLike = sessionStorage
): LoginIntroSnapshot | null {
  const raw = storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  storage.removeItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isLoginIntroSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
cd frontend
npm test -- src/utils/loginIntro.test.ts
```

Expected: all login-intro utility tests PASS.

- [ ] **Step 5: Commit the storage layer**

```bash
git add frontend/src/utils/loginIntro.ts frontend/src/utils/loginIntro.test.ts
git commit -m "feat(frontend): add intro animation state"
```

## Task 2: Best-Effort Real Course Snapshot Preparation

**Files:**
- Modify: `frontend/src/utils/loginIntro.ts`
- Test: `frontend/src/utils/loginIntro.test.ts`

- [ ] **Step 1: Add failing tests for successful and failed course prefetch**

Add a complete `Course` fixture and these tests:

```ts
import type { Course } from '@/types/course'
import { prepareLoginIntro } from './loginIntro'

const course: Course = {
  id: 7,
  course_name: '数据库原理',
  weekday: 1,
  start_time: '14:00',
  end_time: '15:40',
  building_id: 4,
  building: { id: 4, name: '教4', type: '教学楼' },
  room_name: '102',
  teacher: '曾星',
  weeks: '1-16',
  created_at: '2026-06-20T08:00:00'
}

it('prepares the nearest active course for the login animation', async () => {
  const session = createStorage()
  const local = createStorage()
  local.setItem('campusmind-selected-week', '12')

  await prepareLoginIntro(
    async () => [course],
    session,
    local,
    new Date('2026-06-22T10:00:00')
  )

  expect(consumeLoginIntroFlag(session)).toBe(true)
  expect(consumeLoginIntroSnapshot(session)?.courseName).toBe('数据库原理')
})

it('still queues the generic login animation when course loading fails', async () => {
  const session = createStorage()
  const local = createStorage()

  await prepareLoginIntro(
    async () => Promise.reject(new Error('network')),
    session,
    local,
    new Date('2026-06-22T10:00:00')
  )

  expect(consumeLoginIntroFlag(session)).toBe(true)
  expect(consumeLoginIntroSnapshot(session)).toBeNull()
})
```

- [ ] **Step 2: Run the test and verify the helper is absent**

Run:

```bash
cd frontend
npm test -- src/utils/loginIntro.test.ts
```

Expected: FAIL because `prepareLoginIntro` is not exported.

- [ ] **Step 3: Implement best-effort preparation**

Add imports and the helper to `frontend/src/utils/loginIntro.ts`:

```ts
import { filterCoursesByWeek, findNextCourse, readSelectedWeek } from '@/utils/course'

export async function prepareLoginIntro(
  loadCourses: () => Promise<Course[]>,
  session: StorageLike = sessionStorage,
  local: StorageLike = localStorage,
  now = new Date()
): Promise<void> {
  let snapshot: LoginIntroSnapshot | null = null
  try {
    const selectedWeek = readSelectedWeek(local)
    const courses = filterCoursesByWeek(await loadCourses(), selectedWeek)
    snapshot = buildLoginIntroSnapshot(findNextCourse(courses, now))
  } catch {
    snapshot = null
  }
  markLoginIntroPending(session, snapshot)
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd frontend
npm test -- src/utils/loginIntro.test.ts
```

Expected: all tests PASS, including the rejected loader case.

- [ ] **Step 5: Commit the preparation helper**

```bash
git add frontend/src/utils/loginIntro.ts frontend/src/utils/loginIntro.test.ts
git commit -m "feat(frontend): prepare login course snapshot"
```

## Task 3: One-Time Launch Animation Component

**Files:**
- Create: `frontend/src/components/AppLaunchIntro.vue`

- [ ] **Step 1: Create the focused Anime.js launch component**

Create `frontend/src/components/AppLaunchIntro.vue` with this script contract and timeline:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createTimeline, stagger } from 'animejs'

const emit = defineEmits<{ finish: [] }>()
const root = ref<HTMLElement | null>(null)
let timeline: ReturnType<typeof createTimeline> | null = null
let fallbackTimer: number | null = null
let finished = false

function finishIntro() {
  if (finished) return
  finished = true
  emit('finish')
}

onMounted(() => {
  const rootElement = root.value
  if (!rootElement) return finishIntro()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fallbackTimer = window.setTimeout(finishIntro, 250)
    return
  }

  timeline = createTimeline({ defaults: { ease: 'outCubic' }, onComplete: finishIntro })
  timeline
    .set('.launch-route', { strokeDashoffset: 220 })
    .add('.launch-brand > *', {
      translateY: [8, 0],
      opacity: [0, 1],
      delay: stagger(55),
      duration: 220
    })
    .add('.launch-route', { strokeDashoffset: [220, 0], opacity: [0, 1], duration: 470 }, '-=40')
    .add('.launch-node', { scale: [0.45, 1], opacity: [0, 1], delay: stagger(90), duration: 240 }, '-=260')
    .add('.launch-copy', { translateY: [8, 0], opacity: [0, 1], duration: 220 }, '-=100')
    .add(rootElement, { opacity: [1, 0], duration: 220 }, '+=40')

  fallbackTimer = window.setTimeout(finishIntro, 1400)
})

onBeforeUnmount(() => {
  timeline?.revert()
  if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
})
</script>
```

Add this template and scoped style below the script. It intentionally contains no click handler or skip control:

```vue
<template>
  <section ref="root" class="launch-intro" aria-label="智行正在启动">
    <div class="launch-stage">
      <div class="launch-brand">
        <span>智</span>
        <strong>智行 CampusMind</strong>
      </div>
      <svg viewBox="0 0 300 130" role="img" aria-label="校园路线正在连接">
        <path
          class="launch-route"
          d="M24 94 C72 42, 126 92, 178 44 S252 31, 278 47"
          pathLength="220"
        />
        <circle class="launch-node launch-start" cx="24" cy="94" r="8" />
        <circle class="launch-node launch-end" cx="278" cy="47" r="8" />
      </svg>
      <p class="launch-copy">把校园连起来</p>
    </div>
  </section>
</template>

<style scoped>
.launch-intro {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: #11383a;
  color: #fff;
  pointer-events: auto;
  will-change: opacity;
}
.launch-stage { width: min(82vw, 340px); }
.launch-brand { display: flex; align-items: center; gap: 10px; }
.launch-brand > * { opacity: 0; }
.launch-brand span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: #0b766f;
  font-weight: 800;
}
.launch-brand strong { font-size: 15px; }
.launch-stage svg { width: 100%; margin: 18px 0 0; overflow: visible; }
.launch-route {
  fill: none;
  stroke: #62c8ba;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 220;
  opacity: 0;
}
.launch-node {
  fill: #11383a;
  stroke: #fff;
  stroke-width: 5;
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
}
.launch-start { fill: #168f78; }
.launch-end { fill: #f2b84b; }
.launch-copy {
  margin: 4px 0 0;
  color: #d5e6e3;
  font-size: 22px;
  font-weight: 750;
  text-align: center;
  opacity: 0;
}
</style>
```

- [ ] **Step 2: Run type-check and build**

Run:

```bash
cd frontend
npm run build
```

Expected: `vue-tsc --noEmit` and Vite build both succeed.

- [ ] **Step 3: Commit the launch component**

```bash
git add frontend/src/components/AppLaunchIntro.vue
git commit -m "feat(frontend): add one-time launch animation"
```

## Task 4: Real Course Login Ticket Timeline

**Files:**
- Modify: `frontend/src/components/LoginWelcomeIntro.vue`

- [ ] **Step 1: Add a typed optional snapshot prop and display fallbacks**

At the top of `LoginWelcomeIntro.vue`, add:

```ts
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { LoginIntroSnapshot } from '@/utils/loginIntro'

const props = defineProps<{ snapshot?: LoginIntroSnapshot | null }>()
const ticketTitle = computed(() => props.snapshot?.courseName ?? '今日路线已接通')
const ticketMeta = computed(() => {
  if (!props.snapshot) return '课表 · 地图 · 出发建议'
  return `${props.snapshot.startTime} · ${props.snapshot.buildingName} ${props.snapshot.roomName}`
})
```

Replace the ticket text with:

```vue
<article class="intro-ticket">
  <span>{{ snapshot ? '下一节课' : '今日校园' }}</span>
  <strong>{{ ticketTitle }}</strong>
  <small>{{ ticketMeta }}</small>
</article>
```

- [ ] **Step 2: Retune the timeline to the approved 1.8-second storyboard**

Use this sequence in `onMounted`:

```ts
timeline = createTimeline({ defaults: { ease: 'outCubic' }, onComplete: finishIntro })
timeline
  .set('.intro-route', { strokeDashoffset: 280 })
  .add('.intro-brand', { translateY: [10, 0], opacity: [0, 1], duration: 260 })
  .add('.intro-route', { strokeDashoffset: [280, 0], opacity: [0, 1], duration: 660 }, '-=40')
  .add('.intro-node', { scale: [0.45, 1], opacity: [0, 1], delay: stagger(110), duration: 320 }, '-=420')
  .add('.intro-ticket', { translateY: [22, 0], opacity: [0, 1], duration: 430 }, '-=120')
  .add('.intro-copy > *', { translateY: [8, 0], opacity: [0, 1], delay: stagger(55), duration: 260 }, '-=260')
  .add('.intro-ticket', { translateY: [0, -18], scale: [1, 0.98], duration: 350 }, '+=80')
  .add(rootElement, { opacity: [1, 0], duration: 350 }, '-=300')

handoffTimer = window.setTimeout(startHomeHandoff, 1450)
fallbackTimer = window.setTimeout(finishIntro, 2400)
```

Keep the existing `prefers-reduced-motion` branch, event idempotence, timer cleanup, and `timeline?.revert()` behavior. Do not add a skip handler or button.

- [ ] **Step 3: Run build verification**

Run:

```bash
cd frontend
npm run build
```

Expected: build succeeds with no TypeScript or Vue template errors.

- [ ] **Step 4: Commit the login animation component**

```bash
git add frontend/src/components/LoginWelcomeIntro.vue
git commit -m "feat(frontend): animate real course login ticket"
```

## Task 5: Login Preparation and Serialized App Orchestration

**Files:**
- Modify: `frontend/src/pages/LoginPage.vue`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Prepare the animation snapshot after successful authentication**

Change the imports in `LoginPage.vue`:

```ts
import { getCourses } from '@/api/courses'
import { prepareLoginIntro } from '@/utils/loginIntro'
```

Replace the current marker call in `handleSubmit` with:

```ts
await authStore.login(form)
await prepareLoginIntro(getCourses)
showSuccessToast('登录成功')
const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/home'
await router.replace(redirect)
```

Because `prepareLoginIntro` catches loader failures internally, this await cannot convert a successful login into a failed login.

- [ ] **Step 2: Serialize the two overlays in `App.vue`**

Add imports:

```ts
import AppLaunchIntro from '@/components/AppLaunchIntro.vue'
import type { LoginIntroSnapshot } from '@/utils/loginIntro'
import {
  consumeLoginIntroFlag,
  consumeLoginIntroSnapshot,
  shouldPlayAppLaunchIntro
} from '@/utils/loginIntro'
```

Use these states and orchestration functions:

```ts
const showLaunchIntro = ref(shouldPlayAppLaunchIntro(window.localStorage))
const showLoginIntro = ref(false)
const queuedLoginIntro = ref(false)
const loginIntroSnapshot = ref<LoginIntroSnapshot | null>(null)

function startQueuedLoginIntro() {
  if (showLaunchIntro.value || !queuedLoginIntro.value) return
  queuedLoginIntro.value = false
  showLoginIntro.value = true
}

function finishLaunchIntro() {
  showLaunchIntro.value = false
  startQueuedLoginIntro()
}

function queueLoginIntro() {
  if (!consumeLoginIntroFlag()) return
  loginIntroSnapshot.value = consumeLoginIntroSnapshot()
  queuedLoginIntro.value = true
  startQueuedLoginIntro()
}

function finishLoginIntro() {
  showLoginIntro.value = false
  loginIntroSnapshot.value = null
}
```

Update the route watcher so every protected destination can consume the login animation, while the normal `/home` login still receives the home handoff:

```ts
watch(
  () => route.fullPath,
  () => {
    if (route.meta.requiresAuth) queueLoginIntro()
  },
  { immediate: true }
)
```

Render overlays in this order at the end of the app frame:

```vue
<AppLaunchIntro v-if="showLaunchIntro" @finish="finishLaunchIntro" />
<LoginWelcomeIntro
  v-if="showLoginIntro"
  :snapshot="loginIntroSnapshot"
  @handoff="startHomeHandoff"
  @finish="finishLoginIntro"
/>
```

- [ ] **Step 3: Run utility tests and complete build**

Run:

```bash
cd frontend
npm test -- src/utils/loginIntro.test.ts src/utils/course.test.ts src/router/authGuard.test.ts
npm run build
```

Expected: all selected tests pass and the production build succeeds.

- [ ] **Step 4: Commit integration**

```bash
git add frontend/src/pages/LoginPage.vue frontend/src/App.vue
git commit -m "feat(frontend): link login animation to home"
```

## Task 6: Handoff Polish, Reduced Motion, and Full Verification

**Files:**
- Modify: `frontend/src/styles/base.css`

- [ ] **Step 1: Make the home handoff start under the fading ticket**

Replace the home handoff styles with:

```css
.login-handoff-active .home-ticket {
  animation: cm-ticket-handoff 720ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.login-handoff-active .home-action-row,
.login-handoff-active .home-map-section {
  animation: cm-home-handoff 620ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.login-handoff-active .home-action-row { animation-delay: 120ms; }
.login-handoff-active .home-map-section { animation-delay: 190ms; }

@keyframes cm-ticket-handoff {
  from { opacity: 0; transform: translateY(18px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes cm-home-handoff {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .login-handoff-active .home-ticket,
  .login-handoff-active .home-action-row,
  .login-handoff-active .home-map-section {
    animation-duration: 250ms;
    animation-delay: 0ms;
  }
}
```

- [ ] **Step 2: Run the full frontend test suite**

Run:

```bash
cd frontend
npm test
```

Expected: every existing and new Vitest test passes with zero failures.

- [ ] **Step 3: Run the production build**

Run:

```bash
cd frontend
npm run build
```

Expected: `vue-tsc --noEmit` and Vite build complete successfully.

- [ ] **Step 4: Perform controlled browser verification**

Run the backend and frontend on free ports, then verify:

1. Clear `campusmind-launch-intro-seen-v1`; reload and confirm the 0.9-second launch animation plays.
2. Reload again and confirm the launch animation does not repeat.
3. Log in with an account that has a future course; confirm the ticket shows its course, time, building, and room.
4. Confirm the login overlay completes in about 1.8 seconds without a skip control.
5. Confirm the overlay ticket and home ticket overlap visually without a white flash.
6. Log in with no course or temporarily block `/api/courses`; confirm the generic ticket plays and navigation succeeds.
7. Emulate `prefers-reduced-motion: reduce`; confirm both overlays close in about 0.25 seconds.
8. Confirm login, logout, home, course, map, messages, and schedule navigation still work.

- [ ] **Step 5: Check repository hygiene**

Run:

```bash
git diff --check
git status --short --branch
git status --short --ignored
```

Expected: no whitespace errors; only intended source changes are tracked; `frontend/dist/`, `frontend/node_modules/`, local databases, and caches remain ignored.

- [ ] **Step 6: Commit final polish**

```bash
git add frontend/src/styles/base.css
git commit -m "style(frontend): polish intro handoff motion"
```

## Final Acceptance

- Launch animation plays once per version and cannot trap the app.
- Login animation plays after every successful login and cannot turn a successful login into a failure.
- Real course information appears when available; generic content appears otherwise.
- No skip control is rendered.
- Reduced-motion users receive a short safe transition.
- No backend or unrelated business behavior changes.
- Full frontend tests and production build pass.
