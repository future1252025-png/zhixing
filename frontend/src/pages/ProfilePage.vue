<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import TechIcon from '@/components/TechIcon.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const editing = ref(false)
const saving = ref(false)
const avatarColors = ['#6f9474', '#6f9faa', '#c58f6f', '#9b8caf', '#b07b74', '#ad9a62']
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
  '--avatar-color': authStore.currentUser?.avatar_color || avatarColors[0]
}))

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
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
    showSuccessToast('资料已经保存')
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
  <section class="page profile-page">
    <van-nav-bar title="我的" />
    <div class="page-content profile-content">
      <section
        v-reveal="{ from: 'left', distance: 40, stagger: 55 }"
        class="profile-hero"
      >
        <span class="profile-sun" aria-hidden="true"></span>
        <span class="profile-leaves" aria-hidden="true"><i></i><i></i><i></i></span>

        <div class="avatar-wrap" :style="avatarStyle">
          <span>{{ avatarText }}</span>
          <i></i>
        </div>

        <div class="profile-copy">
          <span>很高兴又见到你</span>
          <h1>{{ authStore.displayName }}</h1>
          <p>@{{ authStore.currentUser?.username || 'campus-user' }}</p>
        </div>

        <button type="button" class="edit-profile-button" @click="startEdit">
          <van-icon name="edit" />
          <span>编辑资料</span>
        </button>

        <footer>
          <div><span>账号状态</span><strong>正常</strong></div>
          <div><span>身份</span><strong>{{ authStore.currentUser?.role || '学生' }}</strong></div>
          <div><span>资料</span><strong>已同步</strong></div>
        </footer>
      </section>

      <Transition name="editor-panel">
        <section v-if="editing" class="profile-editor fresh-card">
          <div class="fresh-section-heading">
            <div>
              <h2>换一个新的样子</h2>
              <p>修改后会保存到你的账号</p>
            </div>
            <span class="editor-leaf" aria-hidden="true"></span>
          </div>

          <van-cell-group inset>
            <van-field
              v-model="profileForm.nickname"
              label="昵称"
              maxlength="50"
              placeholder="输入昵称"
            />
            <van-field
              v-model="profileForm.avatar_text"
              label="头像文字"
              maxlength="2"
              placeholder="1—2 个字"
            />
            <van-field label="头像颜色">
              <template #input>
                <div class="color-picker" role="group" aria-label="选择头像颜色">
                  <button
                    v-for="color in avatarColors"
                    :key="color"
                    type="button"
                    :class="{ active: profileForm.avatar_color === color }"
                    :style="{ '--picker-color': color }"
                    :aria-label="`选择颜色 ${color}`"
                    :aria-pressed="profileForm.avatar_color === color"
                    @click="profileForm.avatar_color = color"
                  >
                    <i></i>
                  </button>
                </div>
              </template>
            </van-field>
          </van-cell-group>

          <div class="edit-actions">
            <van-button
              type="primary"
              block
              :loading="saving"
              loading-text="正在保存"
              @click="saveProfile"
            >
              保存修改
            </van-button>
            <van-button block plain @click="cancelEdit">暂时不改</van-button>
          </div>
        </section>
      </Transition>

      <section
        v-reveal="{ from: 'right', distance: 38, stagger: 50 }"
        class="account-card fresh-card"
      >
        <div class="fresh-section-heading">
          <div><h2>账号信息</h2><p>这些信息只属于你</p></div>
          <span class="account-stamp">安心使用</span>
        </div>

        <div class="account-list">
          <article>
            <span><van-icon name="contact" /></span>
            <div><small>用户名</small><strong>{{ authStore.currentUser?.username || '未加载' }}</strong></div>
          </article>
          <article>
            <span><van-icon name="notes-o" /></span>
            <div><small>学号</small><strong>{{ authStore.currentUser?.student_id || '尚未填写' }}</strong></div>
          </article>
          <article>
            <span><van-icon name="certificate" /></span>
            <div><small>账号角色</small><strong>{{ authStore.currentUser?.role || '学生' }}</strong></div>
          </article>
        </div>
      </section>

      <section
        v-reveal="{ from: 'left', distance: 38 }"
        class="data-note"
      >
        <span class="note-icon"><TechIcon name="spark" :size="21" /></span>
        <div>
          <strong>你的校园记录会留在这里</strong>
          <p>课表、常去地点和路线偏好都与你的账号关联。</p>
        </div>
      </section>

      <div v-reveal="{ from: 'right', distance: 34 }" class="logout-wrap">
        <button type="button" class="logout-button" @click="handleLogout">
          <span><van-icon name="back-top" /></span>
          <span><strong>退出当前账号</strong><small>下次回来还可以继续使用</small></span>
          <TechIcon name="arrow" :size="18" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.profile-page {
  background:
    radial-gradient(circle at 103% 2%, rgba(242, 200, 111, 0.18), transparent 18rem),
    radial-gradient(circle at -12% 47%, rgba(111, 159, 170, 0.1), transparent 18rem);
}

.profile-content {
  display: grid;
  gap: 17px;
}

.profile-hero {
  --avatar-color: var(--fresh-green);
  position: relative;
  display: grid;
  grid-auto-rows: max-content;
  justify-items: center;
  align-content: start;
  gap: 14px;
  min-height: 346px;
  overflow: hidden;
  border-radius: 34px 34px 26px 34px;
  background:
    linear-gradient(150deg, rgba(255, 255, 255, 0.48), transparent 43%),
    #e5eee0;
  padding: 30px 20px 0;
  text-align: center;
  box-shadow: var(--fresh-shadow-soft);
}

.profile-hero::after {
  position: absolute;
  right: -65px;
  bottom: 28px;
  width: 210px;
  height: 125px;
  border-radius: 50%;
  background: rgba(111, 159, 170, 0.1);
  content: "";
  transform: rotate(-17deg);
}

.profile-sun {
  position: absolute;
  top: 31px;
  right: 30px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 10px rgba(242, 200, 111, 0.12);
  animation: profile-sun 4s ease-in-out infinite;
}

.profile-leaves {
  position: absolute;
  bottom: 68px;
  left: 20px;
  display: flex;
  gap: 2px;
  transform: rotate(-12deg);
}

.profile-leaves i {
  width: 21px;
  height: 42px;
  border-radius: 100% 0 100% 0;
  background: rgba(91, 134, 91, 0.24);
  transform: rotate(-35deg);
}

.avatar-wrap {
  position: relative;
  display: grid;
  width: 100px;
  height: 100px;
  place-items: center;
  border: 7px solid rgba(255, 255, 255, 0.62);
  border-radius: 36px 43px 34px 44px;
  background: var(--avatar-color);
  color: #fff;
  box-shadow: 0 18px 34px color-mix(in srgb, var(--avatar-color) 24%, transparent);
  transform: rotate(-3deg);
}

.avatar-wrap span {
  font-family: "STKaiti", "KaiTi", sans-serif;
  font-size: 38px;
  font-weight: 720;
}

.avatar-wrap i {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 22px;
  height: 22px;
  border: 4px solid #e5eee0;
  border-radius: 50%;
  background: #7fa16f;
}

.profile-copy {
  position: relative;
  z-index: 2;
  margin-top: 0;
}

.profile-copy > span {
  color: var(--fresh-green);
  font-size: 10px;
  font-weight: 720;
}

.profile-copy h1 {
  margin: 5px 0 0;
  color: var(--fresh-ink);
  font-family: "STKaiti", "KaiTi", "PingFang SC", sans-serif;
  font-size: 32px;
  line-height: 1;
}

.profile-copy p {
  margin: 6px 0 0;
  color: var(--fresh-muted);
  font-size: 10px;
}

.edit-profile-button {
  position: relative;
  z-index: 2;
  display: flex;
  height: 36px;
  min-height: 36px;
  max-height: 36px;
  align-self: start;
  align-items: center;
  gap: 6px;
  margin-top: 0;
  border: 1px solid rgba(79, 125, 88, 0.18);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.58);
  color: var(--fresh-green-dark);
  cursor: pointer;
  font-size: 10px;
  font-weight: 720;
  padding: 0 11px;
}

.profile-hero footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid rgba(79, 125, 88, 0.12);
  background: rgba(255, 255, 255, 0.34);
  padding: 12px 10px;
}

.profile-hero footer div {
  display: grid;
  gap: 3px;
}

.profile-hero footer div + div {
  border-left: 1px solid rgba(79, 125, 88, 0.12);
}

.profile-hero footer span { color: var(--fresh-muted); font-size: 8px; }
.profile-hero footer strong { color: var(--fresh-ink); font-size: 10px; }

.profile-editor,
.account-card {
  padding: 18px;
}

.editor-leaf {
  width: 29px;
  height: 39px;
  border-radius: 100% 0 100% 0;
  background: #dcebd6;
  transform: rotate(34deg);
}

.profile-editor :deep(.van-cell-group) {
  margin-top: 15px;
}

.profile-editor :deep(.van-field__label) {
  width: 68px;
}

.color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
}

.color-picker button {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 2px solid transparent;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.color-picker button i {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--picker-color);
}

.color-picker button.active {
  border-color: var(--picker-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--picker-color) 10%, transparent);
}

.edit-actions {
  display: grid;
  gap: 8px;
  margin-top: 13px;
}

.account-stamp {
  border-radius: 999px;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
  font-size: 9px;
  font-weight: 720;
  padding: 6px 9px;
}

.account-list {
  display: grid;
  gap: 8px;
  margin-top: 15px;
}

.account-list article {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 61px;
  border-radius: 18px;
  background: #f7f9f3;
  padding: 9px 11px;
}

.account-list article > span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 14px;
  background: var(--fresh-mint);
  color: var(--fresh-green-dark);
}

.account-list article:nth-child(2) > span {
  background: var(--fresh-sky);
  color: #5e838b;
}

.account-list article:nth-child(3) > span {
  background: #f6ecd4;
  color: #9a793d;
}

.account-list article > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.account-list small { color: var(--fresh-muted); font-size: 9px; }
.account-list strong { overflow: hidden; color: var(--fresh-ink); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }

.data-note {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 11px;
  align-items: center;
  border-radius: 23px;
  background: #e4eff0;
  padding: 15px;
}

.note-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.66);
  color: #5c8790;
}

.data-note strong { color: var(--fresh-ink); font-size: 12px; }
.data-note p { margin: 4px 0 0; color: var(--fresh-text); font-size: 9px; line-height: 1.55; }

.logout-wrap {
  min-width: 0;
}

.logout-button {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 66px;
  border: 1px solid #ead5cf;
  border-radius: 21px;
  background: #fffaf7;
  color: #8e5b55;
  cursor: pointer;
  padding: 10px 13px;
  text-align: left;
}

.logout-button > span:first-child {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 14px;
  background: #f7e7e2;
}

.logout-button > span:nth-child(2) {
  display: grid;
  gap: 3px;
}

.logout-button strong { font-size: 12px; }
.logout-button small { color: #a87b75; font-size: 9px; }

.editor-panel-enter-active,
.editor-panel-leave-active {
  transition:
    opacity 300ms ease,
    transform 440ms var(--fresh-spring);
}

.editor-panel-enter-from,
.editor-panel-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.98) rotate(-0.5deg);
}

@keyframes profile-sun {
  50% { transform: translateY(-5px) scale(1.04); }
}

@media (prefers-reduced-motion: reduce) {
  .profile-sun {
    animation: none;
  }
}
</style>
