import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import BuildingDetailPage from '@/pages/BuildingDetailPage.vue'
import BuildingMessagesPage from '@/pages/BuildingMessagesPage.vue'
import CourseFormPage from '@/pages/CourseFormPage.vue'
import CourseImportPage from '@/pages/CourseImportPage.vue'
import CoursesPage from '@/pages/CoursesPage.vue'
import HomePage from '@/pages/HomePage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import MapCollectorPage from '@/pages/MapCollectorPage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'
import RegisterPage from '@/pages/RegisterPage.vue'
import SchedulePage from '@/pages/SchedulePage.vue'
import { useAuthStore } from '@/stores/auth'

type AuthRouteTarget = {
  path: string
  fullPath: string
  meta: {
    requiresAuth?: boolean
    publicOnly?: boolean
  }
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

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', name: 'login', component: LoginPage, meta: { publicOnly: true } },
  {
    path: '/register',
    name: 'register',
    component: RegisterPage,
    meta: { publicOnly: true }
  },
  { path: '/home', name: 'home', component: HomePage, meta: { requiresAuth: true } },
  {
    path: '/map-collector',
    name: 'map-collector',
    component: MapCollectorPage
  },
  {
    path: '/buildings/:id',
    name: 'building-detail',
    component: BuildingDetailPage,
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
    path: '/schedule',
    name: 'schedule',
    component: SchedulePage,
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfilePage,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const target = {
    path: to.path,
    fullPath: to.fullPath,
    meta: to.meta
  }

  if (shouldLoadCurrentUser(target, Boolean(authStore.token), Boolean(authStore.currentUser))) {
    try {
      await authStore.loadCurrentUser()
    } catch {
      return {
        path: '/login',
        query: { redirect: to.fullPath }
      }
    }
  }

  const redirect = resolveAuthRedirect(
    target,
    authStore.isAuthenticated
  )
  return redirect ?? true
})

export default router
