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
    <div class="page-content profile-content">
      <section class="profile-ticket">
        <span class="avatar-mark">{{ authStore.displayName.slice(0, 1) || '智' }}</span>
        <div>
          <span>智行账号</span>
          <h1>{{ authStore.displayName }}</h1>
          <p>课程、留言和出发建议均保存在当前账号下。</p>
        </div>
        <div class="profile-route" aria-hidden="true"><i></i><b></b><i></i><b></b><i></i></div>
      </section>

      <section class="account-panel">
        <div class="panel-title">
          <h2>账号信息</h2>
          <p>第一版为课程设计演示账号</p>
        </div>
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
.profile-content { display: grid; gap: 16px; }
.profile-ticket {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 15px;
  align-items: center;
  overflow: hidden;
  border-radius: var(--cm-radius);
  background: #153a3d;
  color: #fff;
  box-shadow: var(--cm-shadow-strong);
  padding: 18px;
}

.avatar-mark {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 2px solid rgba(255, 255, 255, 0.48);
  border-radius: 50%;
  background: var(--cm-primary);
  color: #ffffff;
  font-size: 25px;
  font-weight: 760;
}

.profile-ticket > div > span { color: #9fbfbb; font-size: 11px; }
.profile-ticket h1 { margin: 4px 0 4px; font-size: 24px; }.profile-ticket p { margin: 0; color: #c7dcd9; font-size: 12px; line-height: 1.5; }

.profile-route {
  position: absolute;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 0;
}

.profile-route i {
  position: relative;
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: var(--cm-green);
}
.profile-route i:last-child { background: var(--cm-amber); }.profile-route b { width: 24px; height: 2px; background: #62c8ba; }

.account-panel {
  border-top: 1px solid var(--cm-line);
  border-bottom: 1px solid var(--cm-line);
  background: #fff;
  padding: 15px 14px;
}

.panel-title h2 {
  margin: 0;
  color: var(--cm-ink);
  font-size: 19px;
  font-weight: 760;
}

.panel-title p {
  margin: 5px 0 14px;
  color: var(--cm-muted);
  font-size: 13px;
}

.account-list {
  border-top: 1px solid var(--cm-line);
}

.account-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
}
.account-list article + article { border-top: 1px solid var(--cm-line); }

.account-list span {
  color: var(--cm-muted);
  font-size: 13px;
}

.account-list strong {
  color: var(--cm-ink);
  font-size: 14px;
}
</style>
