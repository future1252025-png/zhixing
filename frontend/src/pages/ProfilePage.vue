<script setup lang="ts">
import { onMounted } from 'vue'
import { showFailToast } from 'vant'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

onMounted(async () => {
  if (!authStore.currentUser && authStore.token) {
    try {
      await authStore.loadCurrentUser()
    } catch {
      showFailToast('登录状态已失效，请重新登录')
      await router.replace('/login')
    }
  }
})

async function handleLogout() {
  authStore.logout()
  await router.replace('/login')
}
</script>

<template>
  <section class="page">
    <van-nav-bar title="我的" />
    <div class="page-content">
      <section class="hero-panel profile-card">
        <span class="avatar-mark">{{ authStore.displayName.slice(0, 1) || '智' }}</span>
        <div>
          <span class="hero-eyebrow">个人中心</span>
          <h1 class="hero-title">{{ authStore.displayName }}</h1>
          <p class="hero-copy">管理当前演示账号，课程和留言都与登录状态关联。</p>
        </div>
      </section>

      <section class="surface-panel account-panel">
        <h2>账号信息</h2>
        <div class="account-list">
          <article>
            <span>用户名</span>
            <strong>{{ authStore.currentUser?.username || '-' }}</strong>
          </article>
          <article>
            <span>角色</span>
            <strong>{{ authStore.currentUser?.role || '-' }}</strong>
          </article>
        </div>
      </section>
      <div class="page-actions">
        <van-button type="danger" plain block @click="handleLogout">退出登录</van-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
}

.avatar-mark {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--cm-primary), var(--cm-green));
  box-shadow: 0 10px 22px rgb(31 111 235 / 22%);
  color: #ffffff;
  font-size: 24px;
  font-weight: 800;
}

.account-panel {
  margin-top: 14px;
  padding: 14px;
}

.account-panel h2 {
  margin: 0 0 12px;
  color: var(--cm-ink);
  font-size: 17px;
}

.account-list {
  display: grid;
  gap: 10px;
}

.account-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--cm-line);
  padding-bottom: 10px;
}

.account-list article:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.account-list span {
  color: var(--cm-muted);
  font-size: 13px;
}

.account-list strong {
  color: var(--cm-ink);
  font-size: 14px;
}
</style>
