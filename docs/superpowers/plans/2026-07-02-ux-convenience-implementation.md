# UX Convenience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 智行 CampusMind easier to use by adding guided entry points, smarter defaults, persistent convenience state, clearer recovery actions, and smoother first-run/login transitions.

**Architecture:** Keep UX convenience logic in small TypeScript utilities and Pinia stores, then consume it from the existing Vue pages. Avoid backend changes unless an existing API is provably broken. Each task preserves the current MVP flow and adds tests before implementation.

**Tech Stack:** Vue 3, TypeScript, Vant UI, Pinia, Vue Router, Anime.js, Vitest, localStorage, sessionStorage

---

## File Map

- Modify `frontend/src/utils/loginIntro.ts`: one-time launch state, login course snapshot, best-effort course prefetch.
- Modify `frontend/src/utils/loginIntro.test.ts`: launch/login animation persistence and snapshot tests.
- Create `frontend/src/components/AppLaunchIntro.vue`: first-open brand animation overlay.
- Modify `frontend/src/components/LoginWelcomeIntro.vue`: login route-ticket animation with optional next-course snapshot.
- Modify `frontend/src/pages/LoginPage.vue`: prepare login animation snapshot after token is available.
- Modify `frontend/src/App.vue`: serialize first-open animation and login animation.
- Create `frontend/src/utils/onboarding.ts`: lightweight onboarding visibility state and next-action helpers.
- Create `frontend/src/utils/onboarding.test.ts`: onboarding state tests.
- Modify `frontend/src/pages/HomePage.vue`: first-use guide and next-step empty states.
- Modify `frontend/src/utils/course.ts`: helpers for week label, empty slot query, and course-table sizing metadata.
- Modify `frontend/src/utils/course.test.ts`: course convenience helper tests.
- Modify `frontend/src/pages/CoursesPage.vue`: clearer empty states, tappable empty cells, stronger current-week persistence.
- Modify `frontend/src/pages/CourseImportPage.vue`: clearer preview summary, no-course error copy, unmatched-building guidance.
- Modify `frontend/src/stores/location.ts`: persist and restore recent start location.
- Modify `frontend/src/stores/location.test.ts`: recent-location persistence tests.
- Modify `frontend/src/pages/SchedulePage.vue`: recent start default, endpoint search guidance, one-time route fallback hint.
- Modify `frontend/src/components/RealCampusMap.vue`: prevent repeated walking-route fallback messages and route redraw loops.
- Modify `frontend/src/pages/BuildingMessagesPage.vue`: stronger send-location guidance and faster fallback action.
- Modify `frontend/src/styles/base.css`: shared guided-state and reduced-motion polish.

## Task 0: Pre-Flight Protection

**Files:**
- Inspect only: `git status --short --branch`
- Inspect only: `frontend/src`

- [ ] **Step 1: Confirm dirty tree before implementation**

Run:

```bash
git status --short --branch
```

Expected: Either a clean tree or known pending animation files:

```text
M frontend/src/App.vue
M frontend/src/components/LoginWelcomeIntro.vue
M frontend/src/pages/LoginPage.vue
M frontend/src/utils/loginIntro.test.ts
M frontend/src/utils/loginIntro.ts
?? frontend/src/components/AppLaunchIntro.vue
```

If other unrelated files are modified, stop and ask before proceeding.

- [ ] **Step 2: Run baseline verification**

Run:

```bash
cd frontend
npm test
npm run build
cd ../backend
python -m pytest
```

Expected: frontend tests pass, frontend build passes, backend tests pass. If a failure appears, use `superpowers:systematic-debugging` before editing.

## Task 1: First-Open and Login Animation Guidance

**Files:**
- Create: `frontend/src/components/AppLaunchIntro.vue`
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/components/LoginWelcomeIntro.vue`
- Modify: `frontend/src/pages/LoginPage.vue`
- Modify: `frontend/src/utils/loginIntro.ts`
- Test: `frontend/src/utils/loginIntro.test.ts`

- [ ] **Step 1: Write failing storage and snapshot tests**

Add these imports and tests to `frontend/src/utils/loginIntro.test.ts`:

```ts
import {
  APP_LAUNCH_INTRO_STORAGE_KEY,
  LOGIN_INTRO_SNAPSHOT_STORAGE_KEY,
  buildLoginIntroSnapshot,
  consumeLoginIntroSnapshot,
  prepareLoginIntro,
  shouldPlayAppLaunchIntro
} from './loginIntro'
import { SELECTED_WEEK_STORAGE_KEY } from './course'
import type { Course } from '@/types/course'

function createCourse(overrides: Partial<Course>): Course {
  const { building, ...restOverrides } = overrides
  return {
    id: 1,
    course_name: '课程',
    weekday: 1,
    start_time: '08:00',
    end_time: '09:40',
    building_id: 1,
    room_name: '101',
    teacher: null,
    weeks: '1-16',
    created_at: '2026-06-01T00:00:00',
    ...restOverrides,
    building: {
      id: building?.id ?? overrides.building_id ?? 1,
      name: building?.name ?? '教1',
      type: building?.type ?? '教学楼'
    }
  }
}

it('plays the app launch intro only once per browser version', () => {
  const storage = createStorage()

  expect(shouldPlayAppLaunchIntro(storage)).toBe(true)
  expect(storage.getItem(APP_LAUNCH_INTRO_STORAGE_KEY)).toBe('1')
  expect(shouldPlayAppLaunchIntro(storage)).toBe(false)
})

it('stores and consumes the login course snapshot once', () => {
  const storage = createStorage()
  const snapshot = buildLoginIntroSnapshot(createCourse({
    id: 7,
    course_name: '数据库系统原理',
    start_time: '15:55',
    building_id: 4,
    building: { id: 4, name: '教4', type: '教学楼' },
    room_name: '102',
    teacher: '曾星'
  }))

  markLoginIntroPending(storage, snapshot)

  expect(storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)).toContain('数据库系统原理')
  expect(consumeLoginIntroSnapshot(storage)).toEqual({
    courseName: '数据库系统原理',
    startTime: '15:55',
    buildingName: '教4',
    roomName: '102'
  })
  expect(consumeLoginIntroSnapshot(storage)).toBeNull()
})

it('prepares a snapshot from the next course for the login intro', async () => {
  const introStorage = createStorage()
  const weekStorage = createStorage()
  weekStorage.setItem(SELECTED_WEEK_STORAGE_KEY, '13')
  const courses = [
    createCourse({ id: 1, course_name: '上午已结束课程', start_time: '08:00' }),
    createCourse({
      id: 2,
      course_name: '软件工程',
      start_time: '15:55',
      end_time: '17:35',
      building_id: 4,
      building: { id: 4, name: '教4', type: '教学楼' },
      room_name: '205',
      teacher: '刘昕'
    })
  ]

  await prepareLoginIntro(async () => courses, {
    introStorage,
    weekStorage,
    now: new Date('2026-06-01T12:00:00')
  })

  expect(consumeLoginIntroFlag(introStorage)).toBe(true)
  expect(consumeLoginIntroSnapshot(introStorage)).toEqual({
    courseName: '软件工程',
    startTime: '15:55',
    buildingName: '教4',
    roomName: '205'
  })
})
```

- [ ] **Step 2: Verify the tests fail**

Run:

```bash
cd frontend
npm test -- src/utils/loginIntro.test.ts
```

Expected: FAIL because the launch and snapshot helpers are missing.

- [ ] **Step 3: Implement the login intro utility**

Update `frontend/src/utils/loginIntro.ts` with:

```ts
import type { Course } from '@/types/course'
import { filterCoursesByWeek, findNextCourse, readSelectedWeek } from './course'

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

type WeekStorageLike = Pick<StorageLike, 'getItem' | 'setItem'>

type PrepareLoginIntroOptions = {
  introStorage?: StorageLike
  weekStorage?: WeekStorageLike
  now?: Date
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
  if (snapshot) storage.setItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  else storage.removeItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
}

export function consumeLoginIntroFlag(storage: StorageLike = sessionStorage): boolean {
  const pending = storage.getItem(LOGIN_INTRO_STORAGE_KEY) === '1'
  if (pending) storage.removeItem(LOGIN_INTRO_STORAGE_KEY)
  return pending
}

export function consumeLoginIntroSnapshot(
  storage: StorageLike = sessionStorage
): LoginIntroSnapshot | null {
  const rawSnapshot = storage.getItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  storage.removeItem(LOGIN_INTRO_SNAPSHOT_STORAGE_KEY)
  if (!rawSnapshot) return null

  try {
    const parsed: unknown = JSON.parse(rawSnapshot)
    return isLoginIntroSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function prepareLoginIntro(
  loadCourses: () => Promise<Course[]>,
  options: PrepareLoginIntroOptions = {}
): Promise<void> {
  const introStorage = options.introStorage ?? sessionStorage
  const weekStorage = options.weekStorage ?? localStorage

  try {
    const selectedWeek = readSelectedWeek(weekStorage)
    const courses = await loadCourses()
    const nextCourse = findNextCourse(
      filterCoursesByWeek(courses, selectedWeek),
      options.now ?? new Date()
    )
    markLoginIntroPending(introStorage, buildLoginIntroSnapshot(nextCourse))
  } catch {
    markLoginIntroPending(introStorage)
  }
}
```

- [ ] **Step 4: Add the one-time launch overlay component**

Create `frontend/src/components/AppLaunchIntro.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { animate, createTimeline, stagger } from 'animejs'

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
    animate(rootElement, { opacity: [1, 0], duration: 220, ease: 'outQuad', onComplete: finishIntro })
    fallbackTimer = window.setTimeout(finishIntro, 320)
    return
  }

  timeline = createTimeline({ defaults: { ease: 'outCubic' }, onComplete: finishIntro })
  timeline
    .set('.launch-route-path', { strokeDashoffset: 240 })
    .add('.launch-brand > *', { translateY: [10, 0], opacity: [0, 1], delay: stagger(70), duration: 320 })
    .add('.launch-route-path', { strokeDashoffset: [240, 0], opacity: [0, 1], duration: 620 }, '-=110')
    .add('.launch-stop', { scale: [0.4, 1], opacity: [0, 1], delay: stagger(95), duration: 300 }, '-=430')
    .add('.launch-copy > *', { translateY: [8, 0], opacity: [0, 1], delay: stagger(58), duration: 280 }, '-=230')
    .add(rootElement, { opacity: [1, 0], duration: 260 }, '+=180')

  fallbackTimer = window.setTimeout(finishIntro, 1300)
})

onBeforeUnmount(() => {
  timeline?.revert()
  if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
})
</script>

<template>
  <section ref="root" class="launch-intro" aria-label="智行启动动画">
    <div class="launch-stage">
      <div class="launch-brand"><span>智</span><strong>智行 CampusMind</strong></div>
      <svg viewBox="0 0 320 128" aria-hidden="true">
        <path class="launch-route-path" d="M24 92 C73 38, 126 98, 168 48 S250 23, 296 55" pathLength="240" />
        <circle class="launch-stop start" cx="24" cy="92" r="8" />
        <circle class="launch-stop middle" cx="168" cy="48" r="9" />
        <circle class="launch-stop end" cx="296" cy="55" r="8" />
      </svg>
      <div class="launch-copy"><strong>正在接入校园路线</strong><span>课表、地图、留言与出发建议已准备好</span></div>
    </div>
  </section>
</template>
```

- [ ] **Step 5: Wire animation orchestration**

In `frontend/src/App.vue`, import `AppLaunchIntro`, `shouldPlayAppLaunchIntro`, `consumeLoginIntroSnapshot`, and `LoginIntroSnapshot`. Add `showLaunchIntro`, `queuedLoginIntro`, and `loginIntroSnapshot` refs. Render `AppLaunchIntro` before `LoginWelcomeIntro`, and delay the login animation until the launch animation finishes.

- [ ] **Step 6: Wire login snapshot preparation**

In `frontend/src/pages/LoginPage.vue`, import `getCourses` and `prepareLoginIntro`. Replace `markLoginIntroPending()` with:

```ts
await prepareLoginIntro(getCourses)
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
cd frontend
npm test -- src/utils/loginIntro.test.ts
npm test
npm run build
```

Expected: all tests pass and build succeeds.

Commit:

```bash
git add frontend/src/App.vue frontend/src/components/AppLaunchIntro.vue frontend/src/components/LoginWelcomeIntro.vue frontend/src/pages/LoginPage.vue frontend/src/utils/loginIntro.ts frontend/src/utils/loginIntro.test.ts
git commit -m "feat(frontend): add guided launch and login transitions"
```

## Task 2: Home First-Use Guide and Next Actions

**Files:**
- Create: `frontend/src/utils/onboarding.ts`
- Test: `frontend/src/utils/onboarding.test.ts`
- Modify: `frontend/src/pages/HomePage.vue`

- [ ] **Step 1: Write failing onboarding tests**

Create `frontend/src/utils/onboarding.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_DISMISSED_STORAGE_KEY,
  getHomeNextAction,
  isOnboardingDismissed,
  markOnboardingDismissed
} from './onboarding'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  }
}

describe('onboarding helpers', () => {
  it('persists dismissed onboarding state', () => {
    const storage = createStorage()

    expect(isOnboardingDismissed(storage)).toBe(false)
    markOnboardingDismissed(storage)

    expect(storage.getItem(ONBOARDING_DISMISSED_STORAGE_KEY)).toBe('1')
    expect(isOnboardingDismissed(storage)).toBe(true)
  })

  it('recommends importing courses when no courses exist', () => {
    expect(getHomeNextAction(0)).toEqual({
      title: '先导入课表',
      description: '导入 HTML 或 Excel 课表后，首页会自动显示下一节课。',
      primaryPath: '/courses/import',
      primaryText: '导入课表',
      secondaryPath: '/courses/new',
      secondaryText: '手动新增'
    })
  })

  it('recommends generating a schedule suggestion when courses exist', () => {
    expect(getHomeNextAction(3).primaryPath).toBe('/schedule')
  })
})
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd frontend
npm test -- src/utils/onboarding.test.ts
```

Expected: FAIL because `onboarding.ts` does not exist.

- [ ] **Step 3: Implement onboarding helpers**

Create `frontend/src/utils/onboarding.ts`:

```ts
export const ONBOARDING_DISMISSED_STORAGE_KEY = 'campusmind-onboarding-dismissed-v1'

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type HomeNextAction = {
  title: string
  description: string
  primaryPath: string
  primaryText: string
  secondaryPath: string
  secondaryText: string
}

export function isOnboardingDismissed(storage: StorageLike = localStorage): boolean {
  return storage.getItem(ONBOARDING_DISMISSED_STORAGE_KEY) === '1'
}

export function markOnboardingDismissed(storage: StorageLike = localStorage): void {
  storage.setItem(ONBOARDING_DISMISSED_STORAGE_KEY, '1')
}

export function getHomeNextAction(courseCount: number): HomeNextAction {
  if (courseCount <= 0) {
    return {
      title: '先导入课表',
      description: '导入 HTML 或 Excel 课表后，首页会自动显示下一节课。',
      primaryPath: '/courses/import',
      primaryText: '导入课表',
      secondaryPath: '/courses/new',
      secondaryText: '手动新增'
    }
  }
  return {
    title: '生成出发建议',
    description: '选择当前位置后，系统会根据下一节课给出建议出发时间。',
    primaryPath: '/schedule',
    primaryText: '去生成路线',
    secondaryPath: '/courses',
    secondaryText: '查看课表'
  }
}
```

- [ ] **Step 4: Add home guide UI**

In `frontend/src/pages/HomePage.vue`, import `isOnboardingDismissed`, `markOnboardingDismissed`, and `getHomeNextAction`. Add refs:

```ts
const showOnboarding = ref(
  typeof window === 'undefined' ? false : !isOnboardingDismissed(window.localStorage)
)
const homeNextAction = computed(() => getHomeNextAction(courses.value.length))

function dismissOnboarding() {
  if (typeof window !== 'undefined') markOnboardingDismissed(window.localStorage)
  showOnboarding.value = false
}
```

Add a small guide card above `.home-ticket`:

```vue
<section v-if="showOnboarding" class="home-guide">
  <div>
    <span>快速开始</span>
    <strong>{{ homeNextAction.title }}</strong>
    <p>{{ homeNextAction.description }}</p>
  </div>
  <div class="home-guide-actions">
    <button type="button" @click="router.push(homeNextAction.primaryPath)">
      {{ homeNextAction.primaryText }}
    </button>
    <button type="button" @click="dismissOnboarding">知道了</button>
  </div>
</section>
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd frontend
npm test -- src/utils/onboarding.test.ts
npm test
npm run build
```

Commit:

```bash
git add frontend/src/utils/onboarding.ts frontend/src/utils/onboarding.test.ts frontend/src/pages/HomePage.vue
git commit -m "feat(frontend): add home onboarding guidance"
```

## Task 3: Course Table Convenience

**Files:**
- Modify: `frontend/src/utils/course.ts`
- Test: `frontend/src/utils/course.test.ts`
- Modify: `frontend/src/pages/CoursesPage.vue`

- [ ] **Step 1: Add failing course convenience tests**

Append to `frontend/src/utils/course.test.ts`:

```ts
import { buildCourseCreateQuery, getCourseSlotAriaLabel } from './course'

it('builds route query for creating a course from an empty timetable slot', () => {
  expect(buildCourseCreateQuery(5, { start_time: '14:00', end_time: '15:40' })).toEqual({
    weekday: '5',
    start_time: '14:00',
    end_time: '15:40'
  })
})

it('builds a clear label for empty timetable cells', () => {
  expect(getCourseSlotAriaLabel('星期五', '5-6')).toBe('在星期五第5-6节添加课程')
})
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd frontend
npm test -- src/utils/course.test.ts
```

Expected: FAIL because the helpers are not exported.

- [ ] **Step 3: Implement course helpers**

Add to `frontend/src/utils/course.ts`:

```ts
export function buildCourseCreateQuery(
  weekday: number,
  slot: Pick<CourseTimeSlot, 'start_time' | 'end_time'>
): Record<string, string> {
  return {
    weekday: String(weekday),
    start_time: slot.start_time,
    end_time: slot.end_time
  }
}

export function getCourseSlotAriaLabel(weekdayLabel: string, section: string): string {
  return `在${weekdayLabel}第${section}节添加课程`
}
```

- [ ] **Step 4: Use helpers in the course table**

In `frontend/src/pages/CoursesPage.vue`, replace inline empty-cell query construction with `buildCourseCreateQuery`, and replace the generic empty-cell aria label with:

```vue
:aria-label="getCourseSlotAriaLabel(weekday.label, slot.section)"
```

Keep the seven-column table visible without horizontal scrolling. If text crowds on very narrow screens, reduce inner card typography rather than introducing horizontal scroll.

- [ ] **Step 5: Verify and commit**

Run:

```bash
cd frontend
npm test -- src/utils/course.test.ts
npm test
npm run build
```

Commit:

```bash
git add frontend/src/utils/course.ts frontend/src/utils/course.test.ts frontend/src/pages/CoursesPage.vue
git commit -m "feat(frontend): improve course table convenience"
```

## Task 4: Course Import Recovery and Review Clarity

**Files:**
- Modify: `frontend/src/pages/CourseImportPage.vue`
- Test: `frontend/src/api/courses.test.ts`

- [ ] **Step 1: Add API import preview regression test**

In `frontend/src/api/courses.test.ts`, ensure `previewCourseImport` sends multipart form data:

```ts
it('uploads course import preview files as multipart form data', async () => {
  const calls: unknown[] = []
  vi.spyOn(request, 'post').mockImplementation(async (...args) => {
    calls.push(args)
    return { data: { total: 0, matched_count: 0, needs_review_count: 0, items: [] } }
  })

  await previewCourseImport(new File(['<html></html>'], 'schedule.html', { type: 'text/html' }))

  expect(calls[0][0]).toBe('/api/courses/import/preview')
  expect(calls[0][1]).toBeInstanceOf(FormData)
  expect(calls[0][2]).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } })
})
```

- [ ] **Step 2: Verify the API test**

Run:

```bash
cd frontend
npm test -- src/api/courses.test.ts
```

Expected: PASS if the API wrapper is already correct. If it fails, fix only the wrapper.

- [ ] **Step 3: Improve import page recovery copy**

In `frontend/src/pages/CourseImportPage.vue`, update the zero-result branch to show:

```ts
showFailToast('没有识别到课程，请上传课表列表页导出的 HTML 或 Excel 文件')
```

Add a visible help block below the file picker:

```vue
<section class="import-help">
  <strong>导入提示</strong>
  <p>请上传课表页面导出的 HTML、HTM 或 Excel 文件。教务首页源码通常不包含课程表数据。</p>
</section>
```

When `needsReviewCount > 0`, show:

```vue
<p class="review-tip">有 {{ needsReviewCount }} 门课程需要确认建筑，确认后才能导入。</p>
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
cd frontend
npm test -- src/api/courses.test.ts
npm test
npm run build
```

Commit:

```bash
git add frontend/src/api/courses.test.ts frontend/src/pages/CourseImportPage.vue
git commit -m "feat(frontend): clarify course import recovery"
```

## Task 5: Schedule Recent Start and Route Recovery

**Files:**
- Modify: `frontend/src/stores/location.ts`
- Test: `frontend/src/stores/location.test.ts`
- Modify: `frontend/src/pages/SchedulePage.vue`
- Modify: `frontend/src/components/RealCampusMap.vue`

- [ ] **Step 1: Add failing recent-location tests**

Append to `frontend/src/stores/location.test.ts`:

```ts
import { RECENT_LOCATION_STORAGE_KEY, readRecentLocation, writeRecentLocation } from './location'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  }
}

it('persists and restores the recent selected location', () => {
  const storage = createStorage()
  const location = {
    source: 'building' as const,
    name: '图书馆',
    latitude: 30.58,
    longitude: 114.32,
    building_id: 1,
    description: '常用起点'
  }

  writeRecentLocation(storage, location)

  expect(storage.getItem(RECENT_LOCATION_STORAGE_KEY)).toContain('图书馆')
  expect(readRecentLocation(storage)).toEqual(location)
})

it('ignores malformed recent location data', () => {
  const storage = createStorage()
  storage.setItem(RECENT_LOCATION_STORAGE_KEY, '{"name":1}')

  expect(readRecentLocation(storage)).toBeNull()
})
```

- [ ] **Step 2: Verify tests fail**

Run:

```bash
cd frontend
npm test -- src/stores/location.test.ts
```

Expected: FAIL because persistence helpers are missing.

- [ ] **Step 3: Implement recent-location persistence**

Add to `frontend/src/stores/location.ts`:

```ts
export const RECENT_LOCATION_STORAGE_KEY = 'campusmind-recent-start-location-v1'

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isSelectedLocation(value: unknown): value is SelectedLocation {
  if (!value || typeof value !== 'object') return false
  const location = value as Record<string, unknown>
  return (
    (location.source === 'preset' || location.source === 'building' || location.source === 'browser') &&
    typeof location.name === 'string' &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    (typeof location.building_id === 'number' || location.building_id === null)
  )
}

export function readRecentLocation(storage: StorageLike = localStorage): SelectedLocation | null {
  const raw = storage.getItem(RECENT_LOCATION_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isSelectedLocation(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeRecentLocation(
  storage: StorageLike = localStorage,
  location: SelectedLocation | null
): void {
  if (!location) {
    storage.removeItem(RECENT_LOCATION_STORAGE_KEY)
    return
  }
  storage.setItem(RECENT_LOCATION_STORAGE_KEY, JSON.stringify(location))
}
```

Call `writeRecentLocation(localStorage, this.selectedLocation)` inside `selectBuilding`, `setBrowserLocation`, and `selectPreset`. In `clearLocation`, remove it.

- [ ] **Step 4: Restore recent location on schedule page**

In `frontend/src/pages/SchedulePage.vue`, import `readRecentLocation`. Inside `loadScheduleData`, before defaulting to the first building:

```ts
const recentLocation = typeof window === 'undefined' ? null : readRecentLocation(window.localStorage)
if (!locationStore.selectedLocation && recentLocation) {
  locationStore.selectedLocation = recentLocation
  selectedOption.value = recentLocation.building_id ? `building:${recentLocation.building_id}` : recentLocation.source
  startQuery.value = recentLocation.name
}
```

Only default to the first building if there is no selected location after this block.

- [ ] **Step 5: Prevent repeated route fallback disruption**

In `frontend/src/components/RealCampusMap.vue`, add a `lastRouteKey` shallow ref:

```ts
const lastRouteKey = shallowRef('')
```

At the start of `renderWalkingRoute`, compute:

```ts
const routeKey = `${props.fromPoint.latitude},${props.fromPoint.longitude}->${props.toPoint.latitude},${props.toPoint.longitude}`
if (routeKey === lastRouteKey.value) return
lastRouteKey.value = routeKey
```

Reset `lastRouteKey.value = ''` in `clearWalkingRoute()` only when `props.fromPoint` or `props.toPoint` becomes missing, not on every zoom or content render. This keeps map zoom from repeatedly re-requesting the same walking route.

- [ ] **Step 6: Verify and commit**

Run:

```bash
cd frontend
npm test -- src/stores/location.test.ts
npm test
npm run build
```

Commit:

```bash
git add frontend/src/stores/location.ts frontend/src/stores/location.test.ts frontend/src/pages/SchedulePage.vue frontend/src/components/RealCampusMap.vue
git commit -m "feat(frontend): remember route start location"
```

## Task 6: Message Location Guidance and Global Polish

**Files:**
- Modify: `frontend/src/pages/BuildingMessagesPage.vue`
- Modify: `frontend/src/styles/base.css`

- [ ] **Step 1: Improve message page location guidance**

In `frontend/src/pages/BuildingMessagesPage.vue`, change the location strip copy from `发布前需要确认位置` to:

```ts
const locationText = computed(() =>
  currentLocation.value
    ? `${currentLocation.value.location_source === 'browser' ? '浏览器定位' : '建筑位置'} · ${currentLocation.value.label}`
    : '发送留言前，请定位或使用当前建筑位置'
)
```

Change the submit error to:

```ts
if (!currentLocation.value) return showFailToast('请先点击“定位”或“使用建筑位置”')
```

- [ ] **Step 2: Add shared guidance styles**

In `frontend/src/styles/base.css`, add:

```css
.guided-card {
  border: 1px solid var(--cm-line);
  border-left: 4px solid var(--cm-primary);
  border-radius: var(--cm-radius);
  background: #fff;
  padding: 12px 14px;
}

.guided-card strong {
  display: block;
  color: var(--cm-ink);
  font-size: 15px;
  line-height: 1.35;
}

.guided-card p {
  margin: 5px 0 0;
  color: var(--cm-muted);
  font-size: 13px;
  line-height: 1.6;
}
```

- [ ] **Step 3: Verify and commit**

Run:

```bash
cd frontend
npm test
npm run build
cd ../backend
python -m pytest
```

Commit:

```bash
git add frontend/src/pages/BuildingMessagesPage.vue frontend/src/styles/base.css
git commit -m "feat(frontend): improve recovery guidance"
```

## Final Verification

- [ ] **Step 1: Run full verification**

Run:

```bash
cd backend
python -m pytest
cd ../frontend
npm test
npm run build
cd ..
git status --short --branch
git status --short --ignored
```

Expected:

- Backend tests pass.
- Frontend tests pass.
- Frontend build passes.
- Only intended files are modified or committed.
- Ignored files include cache, local database, `frontend/node_modules/`, and `frontend/dist/`.

- [ ] **Step 2: Manual UX smoke test**

With backend and frontend running, verify:

1. First browser visit shows launch animation once.
2. Login success shows route-ticket animation.
3. Login animation shows next-course details if courses exist.
4. Home page shows a first-use guide when not dismissed.
5. No-course home state points to import/new course.
6. Course empty cell opens new course with weekday/time prefilled.
7. Course import page explains correct HTML/Excel source.
8. Schedule page restores recent start location.
9. Schedule map does not repeatedly refresh the same walking route while zooming.
10. Building messages page clearly asks for location before sending.

Do not leave dev servers running after manual verification.

## Self-Review Notes

- Spec coverage: launch/login, home guide, course table convenience, import recovery, schedule location defaults, map recovery, and message guidance are all covered.
- Placeholders: no unfinished marker words remain in this plan.
- Scope: no backend business rewrite, no WebSocket, no real AI, no real unified identity, no new SDK beyond existing AMap usage.
