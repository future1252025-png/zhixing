<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const editing = ref(false)
const saving = ref(false)
const avatarColors = ['#0b766f', '#2b6fbe', '#168f78', '#d94f5c', '#7f72b5', '#c29243']
const profileForm = reactive({
  nickname: '',
  avatar_text: '',
  avatar_color: avatarColors[0]
})

const avatarText = computed(() => {
  const text = authStore.currentUser?.avatar_text || authStore.displayName.slice(0, 1) || '智'
  return text.slice(0, 2)
})
const avatarStyle = computed(() => ({
  background: authStore.currentUser?.avatar_color || avatarColors[0]
}))

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
  }
  return '资料保存失败，请稍后重试'
}

function syncProfileForm() {
  profileForm.nickname = authStore.currentUser?.nickname || authStore.displayName
  profileForm.avatar_text = authStore.currentUser?.avatar_text || avatarText.value
  profileForm.avatar_color = authStore.currentUser?.avatar_color || avatarColors[0]
}

function startEdit() {
  syncProfileForm()
  editing.value = true
}

function cancelEdit() {
  syncProfileForm()
  editing.value = false
}

async function saveProfile() {
  const nickname = profileForm.nickname.trim()
  const avatarTextValue = profileForm.avatar_text.trim().slice(0, 2)
  if (!nickname) {
    showFailToast('昵称不能为空')
    return
  }
  if (!avatarTextValue) {
    showFailToast('头像文字不能为空')
    return
  }

  saving.value = true
  try {
    await authStore.updateProfile({
      nickname,
      avatar_text: avatarTextValue,
      avatar_color: profileForm.avatar_color
    })
    showSuccessToast('资料已更新')
    editing.value = false
    syncProfileForm()
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!authStore.currentUser && authStore.token) {
    try {
      await authStore.loadCurrentUser()
    } catch {
      showFailToast('登录状态已失效，请重新登录')
      await router.replace('/login')
      return
    }
  }
  syncProfileForm()
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
      <section v-reveal class="profile-ticket">
        <span class="avatar-mark" :style="avatarStyle">{{ avatarText }}</span>
        <div class="profile-main">
          <span>智行账号</span>
          <h1>{{ authStore.displayName }}</h1>
          <p>课程、留言和出发建议均保存在当前账号下。</p>
        </div>
        <button type="button" class="edit-profile-button" @click="startEdit">
          编辑资料
        </button>
        <div class="profile-route" aria-hidden="true"><i></i><b></b><i></i><b></b><i></i></div>
      </section>

      <section v-if="editing" v-reveal="{ delay: 35 }" class="account-panel edit-panel">
        <div class="panel-title">
          <h2>编辑资料</h2>
          <p>修改昵称和头像后，会同步保存到当前登录账号。</p>
        </div>
        <van-cell-group inset>
          <van-field
            v-model="profileForm.nickname"
            label="昵称"
            maxlength="64"
            placeholder="请输入昵称"
            required
          />
          <van-field
            v-model="profileForm.avatar_text"
            label="头像文字"
            maxlength="2"
            placeholder="例如 智"
            required
          />
          <van-field label="头像颜色">
            <template #input>
              <div class="color-picker" aria-label="选择头像颜色">
                <button
                  v-for="color in avatarColors"
                  :key="color"
                  type="button"
                  :class="{ active: profileForm.avatar_color === color }"
                  :style="{ background: color }"
                  :aria-label="`选择颜色 ${color}`"
                  @click="profileForm.avatar_color = color"
                ></button>
              </div>
            </template>
          </van-field>
        </van-cell-group>
        <div class="edit-actions">
          <van-button type="primary" block :loading="saving" @click="saveProfile">
            保存资料
          </van-button>
          <van-button block plain @click="cancelEdit">
            取消
          </van-button>
        </div>
      </section>

      <section v-reveal="{ delay: 60 }" class="account-panel">
        <div class="panel-title">
          <h2>账号信息</h2>
          <p>第一版为课程设计演示账号，真实统一身份认证作为后续扩展。</p>
        </div>
        <div class="account-list">
          <article>
            <span>用户名</span>
            <strong>{{ authStore.currentUser?.username || '-' }}</strong>
          </article>
          <article>
            <span>昵称</span>
            <strong>{{ authStore.currentUser?.nickname || '-' }}</strong>
          </article>
          <article>
            <span>角色</span>
            <strong>{{ authStore.currentUser?.role || '-' }}</strong>
          </article>
        </div>
      </section>
      <div v-reveal="{ delay: 85 }" class="page-actions">
        <van-button type="danger" plain block @click="handleLogout">退出登录</van-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-content {
  display: grid;
  gap: 16px;
}

.profile-ticket {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 15px;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--cm-radius);
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(180deg, #17383d 0%, #10272c 100%);
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
  color: #ffffff;
  font-size: 25px;
  font-weight: 760;
}

.profile-main {
  min-width: 0;
  padding-right: 96px;
}

.profile-main > span {
  color: #9fbfbb;
  font-size: 11px;
}

.profile-ticket h1 {
  margin: 4px 0 4px;
  font-size: 24px;
  overflow-wrap: anywhere;
}

.profile-ticket p {
  margin: 0;
  color: #c7dcd9;
  font-size: 12px;
  line-height: 1.5;
}

.edit-profile-button {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  min-height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: var(--cm-radius-sm);
  background: rgba(255, 255, 255, 0.94);
  color: var(--cm-primary-dark);
  cursor: pointer;
  font-size: 12px;
  font-weight: 760;
  line-height: 1;
  padding: 0 13px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
  transition:
    transform var(--cm-motion),
    background var(--cm-motion),
    box-shadow var(--cm-motion);
}

.edit-profile-button:focus-visible {
  box-shadow: 0 0 0 3px rgba(128, 216, 203, 0.36), 0 8px 18px rgba(0, 0, 0, 0.18);
}

.edit-profile-button:active {
  transform: translateY(1px);
  background: var(--cm-primary-soft);
}

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

.profile-route i:last-child {
  background: var(--cm-amber);
}

.profile-route b {
  width: 24px;
  height: 2px;
  background: #62c8ba;
}

.account-panel {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
  background: var(--cm-surface);
  padding: 15px 14px;
  box-shadow: 0 8px 24px rgba(28, 50, 42, 0.05);
}

.edit-panel {
  border: 1px solid var(--cm-line);
  border-radius: var(--cm-radius);
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

.color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.color-picker button {
  width: 30px;
  height: 30px;
  border: 2px solid #fff;
  border-radius: 999px;
  box-shadow: 0 0 0 1px var(--cm-line);
  cursor: pointer;
}

.color-picker button.active {
  box-shadow: 0 0 0 2px var(--cm-primary);
}

.edit-actions {
  display: grid;
  gap: 9px;
  margin-top: 12px;
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

.account-list article + article {
  border-top: 1px solid var(--cm-line);
}

.account-list span {
  color: var(--cm-muted);
  font-size: 13px;
}

.account-list strong {
  color: var(--cm-ink);
  font-size: 14px;
  overflow-wrap: anywhere;
  text-align: right;
}

@media (max-width: 360px) {
  .profile-ticket {
    grid-template-columns: 1fr;
  }

  .profile-main {
    padding-right: 0;
  }

  .profile-route {
    display: none;
  }
}
</style>
