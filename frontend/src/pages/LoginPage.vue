<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
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

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const submitting = ref(false)
const form = reactive({ username: '', password: '' })
const { keyboardInset, onFieldFocus } = useKeyboardAwarePage({ basePaddingPx: 24 })
const pageStyle = computed(() => ({
  paddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px) + ${keyboardInset.value}px)`,
  scrollPaddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px) + ${keyboardInset.value}px)`
}))

async function handleSubmit() {
  submitting.value = true
  try {
    await authStore.login(form)
    await prepareLoginIntro(getCourses, fetchSemester)
    showSuccessToast('欢迎回来')
    const redirect = sanitizeInternalRedirect(route.query.redirect)
    await router.replace(redirect)
  } catch (error) {
    showFailToast(extractBusinessError(error).message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="auth-page" :style="pageStyle" @focusin="onFieldFocus">
    <span class="wash wash-one" aria-hidden="true"></span>
    <span class="wash wash-two" aria-hidden="true"></span>

    <div class="auth-layout">
      <header class="auth-brand">
        <span class="brand-mark"><i></i><i></i></span>
        <strong>智行</strong>
        <small>校园生活，从容一点</small>
      </header>

      <section class="welcome-scene" aria-labelledby="login-title">
        <div class="welcome-copy">
          <span>嗨，今天也要去校园里走走</span>
          <h1 id="login-title">把课程、地点和出发时间<br />轻轻放在一起。</h1>
          <p>不赶路，也不错过。智行为你整理今天的校园节奏。</p>
        </div>

        <div class="campus-path" aria-hidden="true">
          <span class="path-sun"></span>
          <span class="path-tree tree-a"><i></i><i></i><i></i></span>
          <span class="path-tree tree-b"><i></i><i></i><i></i></span>
          <svg viewBox="0 0 380 124">
            <path class="path-shadow" d="M8 104C68 42 105 113 164 67S265 23 372 70" />
            <path class="path-line" pathLength="1" d="M8 104C68 42 105 113 164 67S265 23 372 70" />
            <g class="path-traveler">
              <circle class="traveler-halo" r="9" />
              <circle class="traveler-core" r="4" />
              <animateMotion
                dur="3.2s"
                begin="0.65s"
                fill="freeze"
                calcMode="spline"
                keyTimes="0;1"
                keySplines="0.22 0.7 0.25 1"
                path="M8 104C68 42 105 113 164 67S265 23 372 70"
              />
            </g>
          </svg>
          <span class="path-dot dot-a"><TechIcon name="calendar" :size="17" /></span>
          <span class="path-dot dot-b"><TechIcon name="route" :size="17" /></span>
          <span class="path-ready"><i></i>路线慢慢铺好了</span>
        </div>
      </section>

      <section class="login-card">
        <div class="card-heading">
          <div>
            <span>欢迎回来</span>
            <h2>登录你的校园日常</h2>
          </div>
          <span class="tiny-leaf" aria-hidden="true"></span>
        </div>

        <van-form class="auth-form" @submit="handleSubmit">
          <van-cell-group inset>
            <van-field
              v-model="form.username"
              name="username"
              label="账号"
              placeholder="输入用户名"
              autocomplete="username"
              left-icon="contact"
              :rules="[{ required: true, message: '请输入用户名' }]"
            />
            <van-field
              v-model="form.password"
              type="password"
              name="password"
              label="密码"
              placeholder="输入登录密码"
              autocomplete="current-password"
              left-icon="shield-o"
              :rules="[{ required: true, message: '请输入密码' }]"
            />
          </van-cell-group>

          <p class="privacy-note"><i></i> 登录信息只用于你的校园账户</p>

          <div class="page-actions">
            <van-button
              type="primary"
              native-type="submit"
              block
              :loading="submitting"
              loading-text="正在登录"
            >
              进入智行
              <TechIcon v-if="!submitting" name="arrow" :size="18" />
            </van-button>
            <van-button plain block native-type="button" @click="router.push('/register')">
              第一次来？创建账号
            </van-button>
          </div>
        </van-form>
      </section>
    </div>
  </main>
</template>

<style scoped>
.auth-page {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background:
    linear-gradient(158deg, rgba(255, 255, 255, 0.7), transparent 46%),
    #f1f5ec;
  padding: 24px 16px 42px;
}

.wash {
  position: absolute;
  border-radius: 48% 52% 65% 35% / 52% 42% 58% 48%;
  pointer-events: none;
}

.wash-one {
  top: -130px;
  right: -120px;
  width: 330px;
  height: 300px;
  background: rgba(138, 177, 137, 0.2);
  animation: wash-float 9s ease-in-out infinite alternate;
}

.wash-two {
  bottom: -180px;
  left: -170px;
  width: 380px;
  height: 360px;
  background: rgba(111, 159, 170, 0.13);
  animation: wash-float 11s 1s ease-in-out infinite alternate-reverse;
}

.auth-layout {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(100%, 470px);
  min-height: calc(100dvh - 66px);
  align-content: center;
  gap: 22px;
  margin: 0 auto;
}

.auth-brand {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: center;
  gap: 9px;
  animation: soft-arrive 960ms var(--fresh-spring) both;
}

.auth-brand strong {
  color: var(--fresh-ink);
  font-size: 19px;
  letter-spacing: 0.05em;
}

.auth-brand small {
  justify-self: end;
  color: var(--fresh-muted);
  font-size: 13px;
}

.brand-mark {
  position: relative;
  display: block;
  width: 29px;
  height: 29px;
  border-radius: 10px 13px 9px 14px;
  background: var(--fresh-green);
  transform: rotate(-5deg);
}

.brand-mark i {
  position: absolute;
  width: 9px;
  height: 15px;
  border-radius: 100% 0 100% 0;
  background: #e9f3e5;
}

.brand-mark i:first-child {
  top: 4px;
  left: 5px;
  transform: rotate(-12deg);
}

.brand-mark i:last-child {
  right: 5px;
  bottom: 4px;
  transform: rotate(78deg);
}

.welcome-scene {
  position: relative;
  padding: 12px 3px 0;
  animation: soft-arrive 1080ms 120ms var(--fresh-spring) both;
}

.welcome-copy > span {
  color: var(--fresh-green-dark);
  font-size: 13px;
  font-weight: 720;
}

.welcome-copy h1 {
  margin: 9px 0 0;
  color: var(--fresh-ink);
  font-family: "STKaiti", "KaiTi", "PingFang SC", sans-serif;
  font-size: clamp(29px, 7.4vw, 43px);
  font-weight: 760;
  line-height: 1.17;
  letter-spacing: -0.045em;
}

.welcome-copy p {
  max-width: 340px;
  margin: 11px 0 0;
  color: var(--fresh-text);
  font-size: 13px;
  line-height: 1.75;
}

.campus-path {
  position: relative;
  height: 112px;
  margin-top: 6px;
}

.campus-path svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  fill: none;
}

.path-shadow {
  stroke: rgba(79, 125, 88, 0.13);
  stroke-linecap: round;
  stroke-width: 9;
}

.path-line {
  stroke: var(--fresh-green);
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  stroke-linecap: round;
  stroke-width: 2.2;
  animation: path-grow 3.15s 600ms cubic-bezier(0.22, 0.7, 0.25, 1) forwards;
}

.path-traveler {
  opacity: 0;
  animation: traveler-appear 3.2s 650ms ease both;
}

.traveler-halo {
  fill: rgba(79, 125, 88, 0.14);
  stroke: rgba(255, 253, 248, 0.88);
  stroke-width: 3;
}

.traveler-core {
  fill: var(--fresh-green);
  filter: drop-shadow(0 3px 4px rgba(49, 72, 49, 0.24));
}

.path-dot {
  position: absolute;
  display: grid;
  width: 37px;
  height: 37px;
  place-items: center;
  border: 4px solid #f1f5ec;
  border-radius: 50%;
  background: var(--fresh-paper);
  color: var(--fresh-green-dark);
  box-shadow: 0 8px 18px rgba(49, 72, 49, 0.12);
  animation: marker-pop 900ms var(--fresh-spring) both;
}

.path-dot::after {
  position: absolute;
  inset: -4px;
  border: 1px solid rgba(79, 125, 88, 0.24);
  border-radius: inherit;
  content: "";
  animation: marker-ripple 3s ease-out infinite;
}

.dot-a {
  bottom: 7px;
  left: 25%;
  animation-delay: 1.45s;
}

.dot-b {
  top: 18px;
  right: 19%;
  color: #547f88;
  animation-delay: 2.75s;
}

.path-sun {
  position: absolute;
  top: 4px;
  right: 5%;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--fresh-sun);
  box-shadow: 0 0 0 8px rgba(242, 200, 111, 0.14);
  animation: sun-breathe 4.8s 1.2s ease-in-out infinite;
}

.path-tree {
  position: absolute;
  display: flex;
  gap: 2px;
  align-items: flex-end;
  transform-origin: bottom center;
  animation: tree-grow 1.1s var(--fresh-spring) both;
}

.path-tree i {
  width: 8px;
  height: 17px;
  border-radius: 100% 0 100% 0;
  background: #91ad83;
  transform: rotate(-35deg);
}

.tree-a { bottom: 9px; left: 3%; animation-delay: 1.05s; }
.tree-b { top: 25px; right: 1%; animation-delay: 2.5s; scale: 0.8; }

.path-ready {
  position: absolute;
  right: 2px;
  bottom: -1px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.72);
  color: var(--fresh-muted);
  font-size: 13px;
  font-weight: 700;
  opacity: 0;
  padding: 5px 8px;
  animation: ready-arrive 780ms 3.35s var(--fresh-spring) forwards;
}

.path-ready i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fresh-leaf);
}

.login-card {
  position: relative;
  border: 1px solid rgba(79, 125, 88, 0.12);
  border-radius: 30px 30px 24px 30px;
  background: rgba(255, 253, 248, 0.94);
  padding: 20px;
  box-shadow: 0 24px 60px rgba(49, 72, 49, 0.12);
  animation: card-rise 1080ms 420ms var(--fresh-spring) both;
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 15px;
}

.card-heading span {
  color: var(--fresh-green);
  font-size: 13px;
  font-weight: 720;
}

.card-heading h2 {
  margin: 3px 0 0;
  color: var(--fresh-ink);
  font-size: 21px;
}

.tiny-leaf {
  width: 30px;
  height: 42px;
  border-radius: 100% 0 100% 0;
  background: #dcebd6;
  transform: rotate(38deg);
  transform-origin: bottom left;
  animation: tiny-leaf-wave 4.2s 1.6s ease-in-out infinite;
}

.auth-form :deep(.van-cell) {
  min-height: 58px;
}

.auth-form :deep(.van-field__control) {
  font-size: 16px;
}

.auth-form :deep(.van-field__label) {
  width: 43px;
}

.privacy-note {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12px 3px 0;
  color: var(--fresh-muted);
  font-size: 13px;
}

.privacy-note i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fresh-leaf);
}

@keyframes soft-arrive {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: none; }
}

@keyframes card-rise {
  from { opacity: 0; transform: translateY(34px) scale(0.97) rotate(0.8deg); }
  to { opacity: 1; transform: none; }
}

@keyframes path-grow {
  to { stroke-dashoffset: 0; }
}

@keyframes marker-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.35) rotate(-12deg); }
  70% { transform: translateY(-2px) scale(1.08) rotate(2deg); }
  to { opacity: 1; transform: none; }
}

@keyframes marker-ripple {
  0% { opacity: 0; transform: scale(0.82); }
  22% { opacity: 0.72; }
  62%, 100% { opacity: 0; transform: scale(1.45); }
}

@keyframes traveler-appear {
  0% { opacity: 0; }
  10%, 88% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes tree-grow {
  from { opacity: 0; transform: translateY(8px) scaleY(0.25); }
  to { opacity: 1; transform: none; }
}

@keyframes sun-breathe {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 8px rgba(242, 200, 111, 0.14); }
  50% { transform: scale(1.08); box-shadow: 0 0 0 13px rgba(242, 200, 111, 0.08); }
}

@keyframes ready-arrive {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: none; }
}

@keyframes tiny-leaf-wave {
  0%, 100% { transform: rotate(38deg); }
  50% { transform: rotate(30deg) translateY(-3px); }
}

@keyframes wash-float {
  to { transform: translate3d(18px, 16px, 0) rotate(7deg) scale(1.06); }
}

@media (max-height: 760px) {
  .campus-path { height: 72px; }
  .welcome-copy h1 { font-size: 30px; }
  .auth-layout { gap: 13px; }
  .login-card { padding: 17px; }
}

@media (prefers-reduced-motion: reduce) {
  .wash,
  .auth-brand,
  .welcome-scene,
  .path-line,
  .path-traveler,
  .path-dot,
  .path-dot::after,
  .path-tree,
  .path-sun,
  .path-ready,
  .tiny-leaf,
  .login-card {
    animation: none;
  }

  .path-line {
    stroke-dashoffset: 0;
  }

  .path-traveler {
    display: none;
  }

  .path-ready {
    opacity: 1;
  }
}
</style>
