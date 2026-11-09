import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw
} from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { extractBusinessError } from '@/api/errors'
import { CURRENT_WEEK_ANCHOR, waitForRouteAnchor } from '@/utils/routeAnchor'
import { useSemesterStore } from '@/stores/semester'
import { semesterAt } from '@/utils/campusTime'
import { applyRouteScroll, attachRouteScrollOwner, captureRouteScroll, historyEntryPosition,
  rememberRouteScroll, savedRouteScroll, savedTabScroll, waitForRouteContent } from '@/utils/routeScroll'

const LoginPage = () => import('@/pages/LoginPage.vue')
const RegisterPage = () => import('@/pages/RegisterPage.vue')
const PrivacyPage = () => import('@/pages/PrivacyPage.vue')
const HomePage = () => import('@/pages/HomePage.vue')
const CampusMapPage = () => import('@/pages/CampusMapPage.vue')
const MapCollectorPage = () => import('@/pages/MapCollectorPage.vue')
const BuildingDetailPage = () => import('@/pages/BuildingDetailPage.vue')
const BuildingChatroomsPage = () => import('@/pages/BuildingChatroomsPage.vue')
const BuildingMessagesPage = () => import('@/pages/BuildingMessagesPage.vue')
const CoursesPage = () => import('@/pages/CoursesPage.vue')
const CourseFormPage = () => import('@/pages/CourseFormPage.vue')
const CourseImportPage = () => import('@/pages/CourseImportPage.vue')
const CourseMakeupPage = () => import('@/pages/CourseMakeupPage.vue')
const RemindersPage = () => import('@/pages/RemindersPage.vue')
const ProfilePage = () => import('@/pages/ProfilePage.vue')
const SemesterSettingsPage = () => import('@/pages/SemesterSettingsPage.vue')
const NotificationSettingsPage = () => import('@/pages/NotificationSettingsPage.vue')

type AuthRouteTarget = {
  path: string
  fullPath: string
  meta: {
    requiresAuth?: boolean
    publicOnly?: boolean
    devOnly?: boolean
  }
}

export function resolveEnvironmentRedirect(
  to: Pick<AuthRouteTarget, 'meta'>,
  isDevelopment: boolean
): { path: string } | null {
  return to.meta.devOnly && !isDevelopment ? { path: '/home' } : null
}

type AuthRedirect =
  | {
      path: string
      query?: Record<string, string>
    }
  | null

export function resolveAuthRedirect(
  to: AuthRouteTarget,
  isAuthenticated: boolean
): AuthRedirect {
  if (to.meta.requiresAuth && !isAuthenticated) {
    return {
      path: '/login',
      query: { redirect: to.fullPath }
    }
  }
  if (to.meta.publicOnly && isAuthenticated) {
    return { path: '/home' }
  }
  return null
}

export function shouldLoadCurrentUser(
  to: AuthRouteTarget,
  hasToken: boolean,
  hasCurrentUser: boolean
): boolean {
  return Boolean(to.meta.requiresAuth && hasToken && !hasCurrentUser)
}

export function resolveRouteScrollPosition(
  savedPosition: { left: number; top: number } | null,
  hash = ''
): { left: number; top: number } | { el: string; top: number; behavior: 'smooth' } {
  if (savedPosition) return savedPosition
  if (hash) return { el: hash, top: 12, behavior: 'smooth' }
  return { left: 0, top: 0 }
}

export function sanitizeInternalRedirect(value: unknown, fallback = '/home'): string {
  if (typeof value !== 'string') return fallback
  const redirect = value.trim()
  if (
    !redirect.startsWith('/') ||
    redirect.startsWith('//') ||
    redirect.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(redirect)
  ) {
    return fallback
  }
  return redirect
}

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', name: 'login', component: LoginPage, meta: { publicOnly: true } },
  {
    path: '/register',
    name: 'register',
    component: RegisterPage,
    meta: { publicOnly: true }
  },
  { path: '/privacy', name: 'privacy', component: PrivacyPage },
  { path: '/home', name: 'home', component: HomePage, meta: { requiresAuth: true } },
  { path: '/map', name: 'campus-map', component: CampusMapPage, meta: { requiresAuth: true } },
  {
    path: '/map-collector',
    name: 'map-collector',
    component: MapCollectorPage,
    meta: { requiresAuth: true, devOnly: true }
  },
  {
    path: '/buildings/:id',
    name: 'building-detail',
    component: BuildingDetailPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/buildings/:id/chats',
    name: 'building-chatrooms',
    component: BuildingChatroomsPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/buildings/:id/messages',
    name: 'building-messages',
    component: BuildingMessagesPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses',
    name: 'courses',
    component: CoursesPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses/new',
    name: 'course-new',
    component: CourseFormPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses/import',
    name: 'course-import',
    component: CourseImportPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses/:id/edit',
    name: 'course-edit',
    component: CourseFormPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/reminders',
    name: 'reminders',
    component: RemindersPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/profile/semester',
    name: 'semester-settings',
    component: SemesterSettingsPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/profile/notifications',
    name: 'notification-settings',
    component: NotificationSettingsPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfilePage,
    meta: { requiresAuth: true }
  },
  { path: '/courses/makeups', name: 'course-makeups', component: CourseMakeupPage, meta: { requiresAuth: true } },
  { path: '/schedule', redirect: '/reminders' }
]

let cancelPendingScroll: (() => void) | undefined
let activeEntryPosition = historyEntryPosition()
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    cancelPendingScroll?.()
    // A duplicate tab tap must keep the current offset, not replay the older
    // snapshot taken the last time this page was left.
    if (to.fullPath === from.fullPath && !savedPosition) return false
    // A real back/forward wins over a URL anchor. Tab switches remember their
    // last location too, while a new detail page still starts at the top.
    const snapshot = savedPosition
      ? savedRouteScroll(to.fullPath) ?? { viewport: savedPosition, regions: {}, view: {} }
      : !to.hash && !Object.keys(to.query).length ? savedTabScroll(to.path) : undefined
    if (snapshot) {
      const pending = waitForRouteContent(to.fullPath, () => router.currentRoute.value.fullPath === to.fullPath,
        root => applyRouteScroll(root, snapshot))
      cancelPendingScroll = pending.cancel
      return pending.position
    }
    if (to.path === '/courses' && to.hash === CURRENT_WEEK_ANCHOR) {
      const pending = waitForRouteAnchor(
        `${CURRENT_WEEK_ANCHOR}[data-scroll-ready="true"]`,
        () => router.currentRoute.value.fullPath === to.fullPath,
        () => {
          // History navigation preserves the user's browsed week and scroll position.
          const semester = useSemesterStore()
          const requestedWeek = typeof to.query.week === 'string' ? Number(to.query.week) : NaN
          const week = Number.isInteger(requestedWeek) && requestedWeek >= 1 && requestedWeek <= (semester.totalWeeks ?? 0)
            ? requestedWeek : semesterAt(semester.semester, new Date()).current_week
          if (week !== null) semester.setBrowsingWeek(week)
        }
      )
      cancelPendingScroll = pending.cancel
      return pending.position
    }
    // Consuming a one-shot map query must not reset its independent directory.
    if (to.path === from.path && !to.hash) return false
    if (to.hash) {
      const pending = waitForRouteAnchor(to.hash, () => router.currentRoute.value.fullPath === to.fullPath)
      cancelPendingScroll = pending.cancel
      return pending.position
    }
    // A new chat owns its initial bottom position, but history returns above
    // still restore the previous reading position.
    if (to.name === 'building-messages' || (to.name === 'reminders' && typeof to.query.title === 'string')) return false
    const pending = waitForRouteContent(to.fullPath, () => router.currentRoute.value.fullPath === to.fullPath,
      () => window.scrollTo({ left: 0, top: 0, behavior: 'instant' }))
    cancelPendingScroll = pending.cancel
    return pending.position
  }
})

router.beforeEach(async (to, from) => {
  cancelPendingScroll?.()
  const authStore = useAuthStore()
  if (authStore.restorePending) await authStore.restorePending
  attachRouteScrollOwner(authStore.currentUser?.id ?? null)
  if (from.matched.length && to.fullPath !== from.fullPath && (authStore.currentUser || !from.meta.requiresAuth)) {
    const snapshot = captureRouteScroll(from.fullPath)
    if (snapshot) rememberRouteScroll(activeEntryPosition, from.fullPath, snapshot)
  }
  // Preserve old settings bookmarks without bringing the card back to the timetable.
  if (to.path === '/courses' && to.hash === '#semester-settings') return '/profile/semester'
  const target = {
    path: to.path,
    fullPath: to.fullPath,
    meta: to.meta
  }

  const environmentRedirect = resolveEnvironmentRedirect(target, import.meta.env.DEV)
  if (environmentRedirect) return environmentRedirect

  if (shouldLoadCurrentUser(target, Boolean(authStore.token), Boolean(authStore.currentUser))) {
    try {
      await authStore.loadCurrentUser()
    } catch (error) {
      if (extractBusinessError(error).status === 401) {
        authStore.clearSession()
        return {
          path: '/login',
          query: { redirect: to.fullPath, reason: 'expired' }
        }
      }
      return true
    }
  }

  const redirect = resolveAuthRedirect(
    target,
    authStore.isAuthenticated
  )
  return redirect ?? true
})

router.afterEach((_to, _from, failure) => {
  if (!failure) activeEntryPosition = historyEntryPosition()
})

export default router
