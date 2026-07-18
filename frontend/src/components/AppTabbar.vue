<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import TechIcon from '@/components/TechIcon.vue'

const route = useRoute()
const activePath = computed(() => route.path)

const navItems = [
  { path: '/home', label: '校园', icon: 'orbit' },
  { path: '/courses', label: '课表', icon: 'calendar' },
  { path: '/schedule', label: '出发', icon: 'route' },
  { path: '/profile', label: '我的', icon: 'user' }
] as const

function handleTabClick(path: string) {
  if (route.path === path) {
    window.scrollTo({ left: 0, top: 0, behavior: 'auto' })
  }
}
</script>

<template>
  <nav class="app-tabbar" aria-label="主导航">
    <router-link
      v-for="item in navItems"
      :key="item.path"
      :to="item.path"
      class="app-tabbar-item"
      :class="{ active: activePath === item.path }"
      @click="handleTabClick(item.path)"
    >
      <span class="nav-icon-wrap">
        <TechIcon :name="item.icon" :size="21" />
      </span>
      <span>{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.app-tabbar {
  position: fixed;
  right: max(14px, calc((100vw - 560px) / 2));
  bottom: max(12px, env(safe-area-inset-bottom));
  left: max(14px, calc((100vw - 560px) / 2));
  z-index: 1000;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  height: 70px;
  overflow: hidden;
  border: 1px solid rgba(79, 125, 88, 0.13);
  border-radius: 25px;
  background: rgba(255, 254, 250, 0.94);
  box-shadow:
    0 16px 42px rgba(46, 70, 49, 0.13),
    inset 0 1px rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
}

.app-tabbar-item {
  position: relative;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  color: #879186;
  font-size: 11px;
  font-weight: 680;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 380ms var(--fresh-spring),
    transform 380ms var(--fresh-spring);
}

.app-tabbar-item::before {
  position: absolute;
  inset: 7px 8px;
  z-index: -1;
  border-radius: 18px 18px 14px 18px;
  background: transparent;
  content: "";
  transform: scale(0.7) translateY(7px);
  transition:
    background 480ms var(--fresh-spring),
    transform 580ms var(--fresh-spring);
}

.app-tabbar-item.active {
  color: #3f704a;
}

.app-tabbar-item.active::before {
  background: #e7f0e3;
  transform: scale(1);
}

.nav-icon-wrap {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
}

.active .nav-icon-wrap {
  animation: tab-pop 680ms var(--fresh-spring);
}

.app-tabbar-item:active {
  transform: scale(0.92);
}

@keyframes tab-pop {
  0% { transform: translateY(5px) scale(0.74) rotate(-7deg); }
  65% { transform: translateY(-2px) scale(1.08) rotate(2deg); }
  100% { transform: none; }
}

@media (max-width: 360px) {
  .app-tabbar {
    right: 8px;
    left: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .active .nav-icon-wrap {
    animation: none;
  }
}
</style>
