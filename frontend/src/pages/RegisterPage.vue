<script setup lang="ts">
import { reactive, ref } from 'vue'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { getCourses } from '@/api/courses'
import { extractBusinessError } from '@/api/errors'
import { fetchSemester } from '@/api/semester'
import TechIcon from '@/components/TechIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { sanitizeInternalRedirect } from '@/router'
import { useKeyboardAwarePage } from '@/utils/keyboardInset'
import { prepareLoginIntro } from '@/utils/loginIntro'
import { goBack } from '@/utils/navigation'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const submitting = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)
// 确认密码只做本地一致性校验，不进入注册提交载荷
const confirmPassword = ref('')
const form = reactive({ student_id: '', password: '', nickname: '' })
const { pageStyle, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 34 })

async function handleSubmit() {
  submitting.value = true
  try {
    await authStore.register({
      password: form.password,
      nickname: form.nickname,
      student_id: form.student_id
    })
    try {
      await authStore.login({ student_id: form.student_id, password: form.password })
      // 与登录页一致的乐观导航：欢迎卡数据后台预取，立即进入目标页
      void prepareLoginIntro(getCourses, fetchSemester)
      showSuccessToast('账号创建成功，欢迎来到智行')
      await router.replace(sanitizeInternalRedirect(route.query.redirect))
    } catch {
      showSuccessToast('账号已创建，请登录')
      await router.replace({ path: '/login', query: { redirect: route.query.redirect } })
    }
  } catch (error) {
    showFailToast(extractBusinessError(error).message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="page register-page">
    <van-nav-bar title="创建账号" left-arrow @click-left="goBack(router, { path: '/login', query: { redirect: route.query.redirect } })" />

    <div class="page-content register-content" :style="pageStyle" @focusin="onFieldFocus">
      <header v-reveal="{ from: 'left', distance: 34 }" class="register-hero">
        <div>
          <span class="fresh-kicker">从今天开始记录</span>
          <h1 class="fresh-heading">为你的校园日常<br />留一个位置。</h1>
          <p class="fresh-copy">创建账号后，就可以保存课表、常去地点和日常提醒。</p>
        </div>
        <div class="seed-scene" aria-hidden="true">
          <span class="seed-sun"></span>
          <span class="stem"></span>
          <span class="leaf leaf-a"></span>
          <span class="leaf leaf-b"></span>
          <span class="soil"></span>
        </div>
      </header>

      <van-form
        v-reveal="{ from: 'right', distance: 34, stagger: 45 }"
        class="register-card"
        @submit="handleSubmit"
      >
        <div class="form-heading">
          <span>只需要一分钟</span>
          <h2>填写基本信息</h2>
        </div>

        <van-cell-group inset>
          <van-field
            v-model="form.nickname"
            name="nickname"
            label="昵称"
            maxlength="64"
            placeholder="例如 future"
            left-icon="smile-o"
            :rules="[{ required: true, message: '请输入昵称' }]"
          />
          <van-field
            v-model="form.student_id"
            name="student_id"
            label="学号"
            maxlength="32"
            placeholder="输入你的学号"
            autocomplete="username"
            left-icon="notes-o"
            :rules="[{ required: true, message: '请输入学号' }]"
          />
          <van-field
            v-model="form.password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            label="密码"
            placeholder="至少 6 位"
            autocomplete="new-password"
            left-icon="shield-o"
            :right-icon="showPassword ? 'eye-o' : 'closed-eye'"
            :rules="[
              { required: true, message: '请输入密码' },
              { validator: (value: string) => value.length >= 6, message: '密码至少 6 位' }
            ]"
            @click-right-icon="showPassword = !showPassword"
          />
          <van-field
            v-model="confirmPassword"
            :type="showConfirmPassword ? 'text' : 'password'"
            name="confirm_password"
            label="确认密码"
            placeholder="再输入一次"
            autocomplete="new-password"
            left-icon="shield-o"
            :right-icon="showConfirmPassword ? 'eye-o' : 'closed-eye'"
            :rules="[
              { required: true, message: '请再次输入密码' },
              { validator: (value: string) => value === form.password, message: '两次输入的密码不一致' }
            ]"
            @click-right-icon="showConfirmPassword = !showConfirmPassword"
          />
        </van-cell-group>

        <div class="gentle-note">
          <span><i></i><i></i></span>
          <p>
            <strong>昵称</strong>用于个人页展示，之后可在“我的”中修改。
          </p>
        </div>

        <div class="page-actions">
          <van-button
            type="primary"
            native-type="submit"
            block
            :loading="submitting"
            loading-text="正在创建"
          >
            创建账号
            <TechIcon v-if="!submitting" name="arrow" :size="18" />
          </van-button>
          <van-button plain block native-type="button" @click="goBack(router, { path: '/login', query: { redirect: route.query.redirect } })">
            已有账号，返回登录
          </van-button>
        </div>
      </van-form>
    </div>
  </section>
</template>

<style scoped>
.register-page {
  background:
    radial-gradient(circle at 100% 9%, rgba(134, 170, 127, 0.19), transparent 17rem),
    radial-gradient(circle at -5% 85%, rgba(111, 159, 170, 0.12), transparent 19rem);
}

.register-content {
  display: grid;
  gap: 18px;
}

.register-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 118px;
  min-height: 224px;
  align-items: center;
  overflow: hidden;
  border-radius: 32px 32px 25px 32px;
  background: var(--fresh-mint);
  padding: 25px 22px;
}

.register-hero::after {
  position: absolute;
  right: -24px;
  bottom: -42px;
  width: 170px;
  height: 110px;
  border-radius: 50%;
  background: rgba(127, 161, 119, 0.12);
  content: "";
  transform: rotate(-9deg);
}

.register-hero .fresh-heading {
  font-size: clamp(29px, 8vw, 39px);
}

.register-hero .fresh-copy {
  max-width: 280px;
}

.seed-scene {
  position: relative;
  z-index: 1;
  width: 112px;
  height: 142px;
  align-self: end;
}

.seed-sun {
  position: absolute;
  top: 2px;
  right: 5px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 10px rgba(242, 200, 111, 0.13);
  animation: sun-breathe 3.4s ease-in-out infinite;
}

.stem {
  position: absolute;
  bottom: 23px;
  left: 54px;
  width: 3px;
  height: 77px;
  border-radius: var(--radius-pill);
  background: #638568;
  transform-origin: bottom;
  animation: stem-grow 1s 200ms var(--fresh-spring) both;
}

.leaf {
  position: absolute;
  width: 34px;
  height: 48px;
  border-radius: 100% 0 100% 0;
  background: var(--fresh-leaf);
  transform-origin: 100% 100%;
  animation: leaf-open 720ms var(--fresh-spring) both;
}

.leaf-a {
  top: 48px;
  left: 20px;
  transform: rotate(-25deg);
  animation-delay: 620ms;
}

.leaf-b {
  top: 29px;
  right: 18px;
  background: #a2ba8f;
  transform: rotate(68deg);
  animation-delay: 780ms;
}

.soil {
  position: absolute;
  right: 5px;
  bottom: 13px;
  left: 7px;
  height: 24px;
  border-radius: 50%;
  background: #dce8d4;
}

.register-card {
  border: 1px solid rgba(79, 125, 88, 0.11);
  border-radius: 28px;
  background: rgba(255, 253, 248, 0.93);
  padding: 20px;
  box-shadow: var(--fresh-shadow);
}

.form-heading {
  margin-bottom: 15px;
}

.form-heading span {
  color: var(--fresh-green);
  font-size: 12px;
  font-weight: 700;
}

.form-heading h2 {
  margin: 4px 0 0;
  color: var(--fresh-ink);
  font-size: 21px;
}

.register-card :deep(.van-cell) {
  min-height: 57px;
}

.register-card :deep(.van-field__label) {
  /* “确认密码”四字标签的最小宽度，保证不折行 */
  width: 72px;
}

.register-card :deep(.van-field__control) {
  font-size: 16px;
}

.register-card :deep(.van-field__right-icon) {
  /* 明密文切换小眼睛：命中区 ≥44px，负边距抵消占位、不撑高单元格 */
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  margin: -10px -12px -10px 0;
  color: var(--fresh-muted);
}

.gentle-note {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 13px 3px 0;
}

.gentle-note > span {
  position: relative;
  flex: 0 0 22px;
  height: 22px;
}

.gentle-note i {
  position: absolute;
  width: 10px;
  height: 16px;
  border-radius: 100% 0 100% 0;
  background: #a5bb9d;
}

.gentle-note i:last-child {
  right: 0;
  bottom: 0;
  transform: rotate(85deg);
}

.gentle-note p {
  margin: 0;
  color: var(--fresh-muted);
  font-size: 12px;
  line-height: 1.55;
}

.gentle-note strong {
  color: var(--fresh-green-dark);
  font-weight: 800;
}

@keyframes stem-grow {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}

@keyframes leaf-open {
  from { opacity: 0; transform: scale(0.2) rotate(10deg); }
}

@keyframes sun-breathe {
  50% { transform: translateY(-4px) scale(1.04); }
}

@media (max-width: 370px) {
  .register-hero {
    grid-template-columns: 1fr 82px;
    padding: 21px 18px;
  }

  .seed-scene {
    transform: scale(0.78);
    transform-origin: right bottom;
  }
}
</style>
