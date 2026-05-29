import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import BuildingDetailPage from '@/pages/BuildingDetailPage.vue'
import CoursesPage from '@/pages/CoursesPage.vue'
import HomePage from '@/pages/HomePage.vue'
import LoginPage from '@/pages/LoginPage.vue'
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
    path: '/buildings/:id',
    name: 'building-detail',
    component: BuildingDetailPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/courses',
    name: 'courses',
    component: CoursesPage,
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

router.beforeEach((to) => {
  const authStore = useAuthStore()
  const redirect = resolveAuthRedirect(
    {
      path: to.path,
      fullPath: to.fullPath,
      meta: to.meta
    },
    authStore.isAuthenticated
  )
  return redirect ?? true
})

export default router
