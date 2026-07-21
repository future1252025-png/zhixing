import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw
} from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { extractBusinessError } from '@/api/errors'

const LoginPage = () => import('@/pages/LoginPage.vue')
const RegisterPage = () => import('@/pages/RegisterPage.vue')
const HomePage = () => import('@/pages/HomePage.vue')
const MapCollectorPage = () => import('@/pages/MapCollectorPage.vue')
const BuildingDetailPage = () => import('@/pages/BuildingDetailPage.vue')
const BuildingChatroomsPage = () => import('@/pages/BuildingChatroomsPage.vue')
const BuildingMessagesPage = () => import('@/pages/BuildingMessagesPage.vue')
const CoursesPage = () => import('@/pages/CoursesPage.vue')
const CourseFormPage = () => import('@/pages/CourseFormPage.vue')
const CourseImportPage = () => import('@/pages/CourseImportPage.vue')
const SchedulePage = () => import('@/pages/SchedulePage.vue')
const ProfilePage = () => import('@/pages/ProfilePage.vue')

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

export function resolveRouteScrollPosition(
  savedPosition: { left: number; top: number } | null,
  hash = ''
): { left: number; top: number } | { el: string; top: number; behavior: 'smooth' } {
  if (hash) return { el: hash, top: 12, behavior: 'smooth' }
  return savedPosition ?? { left: 0, top: 0 }
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
  routes,
  scrollBehavior(to, _from, savedPosition) {
    return resolveRouteScrollPosition(savedPosition, to.hash)
  }
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

export default router
