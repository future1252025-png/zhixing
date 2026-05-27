import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import CoursesPage from '@/pages/CoursesPage.vue'
import HomePage from '@/pages/HomePage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'
import RegisterPage from '@/pages/RegisterPage.vue'
import SchedulePage from '@/pages/SchedulePage.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  { path: '/login', name: 'login', component: LoginPage },
  { path: '/register', name: 'register', component: RegisterPage },
  { path: '/home', name: 'home', component: HomePage },
  { path: '/courses', name: 'courses', component: CoursesPage },
  { path: '/schedule', name: 'schedule', component: SchedulePage },
  { path: '/profile', name: 'profile', component: ProfilePage }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
