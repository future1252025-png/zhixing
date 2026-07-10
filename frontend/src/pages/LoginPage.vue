<script setup lang="ts">
import { reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { getCourses } from '@/api/courses'
import { useAuthStore } from '@/stores/auth'
import { prepareLoginIntro } from '@/utils/loginIntro'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const submitting = ref(false)
const form = reactive({ username: '', password: '' })

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
  }
  return '登录失败，请检查账号或密码'
}

async function handleSubmit() {
  submitting.value = true
  try {
    await authStore.login(form)
    await prepareLoginIntro(getCourses)
    showSuccessToast('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/home'
    await router.replace(redirect)
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="auth-page">
    <div class="auth-route-board">
      <div class="auth-brand">
        <span class="brand-mark">智</span>
        <div><strong>智行</strong><small>CampusMind</small></div>
      </div>
      <svg class="auth-route" viewBox="0 0 340 132" aria-hidden="true">
        <path d="M22 102 C76 44, 126 96, 174 48 S268 28, 318 54" />
        <circle class="route-start" cx="22" cy="102" r="8" />
        <circle class="route-mid" cx="174" cy="48" r="9" />
        <circle class="route-end" cx="318" cy="54" r="8" />
      </svg>
      <div class="route-label route-label-start">当前位置</div>
      <div class="route-label route-label-end">下一节课</div>
      <h1>让今天的校园路线<br />从课表开始。</h1>
      <p>地图、建筑留言、课表与出发建议，一次登录全部接通。</p>
    </div>

    <div class="auth-form-wrap">
      <van-form class="auth-form" @submit="handleSubmit">
        <div class="form-heading">
          <h2>登录智行</h2>
          <p>使用你的校园演示账号继续</p>
        </div>
        <van-cell-group inset>
          <van-field v-model="form.username" name="username" label="用户名" placeholder="请输入用户名" autocomplete="username" :rules="[{ required: true, message: '请输入用户名' }]" />
          <van-field v-model="form.password" type="password" name="password" label="密码" placeholder="请输入密码" autocomplete="current-password" :rules="[{ required: true, message: '请输入密码' }]" />
        </van-cell-group>
        <div class="page-actions">
          <van-button type="primary" native-type="submit" block :loading="submitting">登录并进入校园</van-button>
          <router-link to="/register"><van-button plain block>创建新账号</van-button></router-link>
        </div>
      </van-form>
    </div>
  </section>
</template>

<style scoped>
.auth-page { min-height: 100vh; background: var(--cm-bg); }
.auth-route-board { position: relative; min-height: 365px; overflow: hidden; border-bottom: 1px solid rgba(10,125,115,.14); background: linear-gradient(90deg, rgba(10,125,115,.065) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(145deg, #fbfdf9 0%, #e9f5ed 62%, #e7f1fa 100%); color: var(--cm-ink); padding: 28px 22px 30px; }
.auth-brand { display: flex; align-items: center; gap: 10px; animation: auth-rise 620ms cubic-bezier(.16,1,.3,1) both; }
.brand-mark { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid rgba(7,86,79,.18); border-radius: 8px; background: var(--cm-primary); color: #fff; box-shadow: 0 10px 24px rgba(10,125,115,.2); font-weight: 800; }
.auth-brand div { display: grid; gap: 1px; }
.auth-brand strong { font-size: 17px; }
.auth-brand small { color: var(--cm-muted); font-size: 10px; }
.auth-route { position: absolute; top: 74px; right: 16px; left: 16px; width: calc(100% - 32px); height: 132px; }
.auth-route path { fill: none; stroke: #21a18f; stroke-width: 5; stroke-linecap: round; stroke-dasharray: 430; stroke-dashoffset: 430; filter: drop-shadow(0 8px 14px rgba(10,125,115,.16)); animation: auth-route-draw 980ms 120ms cubic-bezier(.16,1,.3,1) forwards; }
.auth-route circle { fill: var(--cm-primary); stroke: #fff; stroke-width: 4; opacity: 0; transform-box: fill-box; transform-origin: center; animation: auth-node-in 380ms cubic-bezier(.16,1,.3,1) forwards; }
.auth-route .route-start { animation-delay: 360ms; }
.auth-route .route-mid { fill: #4387c7; animation-delay: 540ms; }
.auth-route .route-end { fill: #f2b84b; }
.auth-route .route-end { animation-delay: 720ms; }
.route-label { position: absolute; border: 1px solid rgba(10,125,115,.12); border-radius: 4px; background: rgba(255,255,255,.72); color: var(--cm-primary-dark); font-size: 10px; padding: 4px 6px; opacity: 0; animation: auth-rise 420ms 680ms cubic-bezier(.16,1,.3,1) forwards; }
.route-label-start { top: 176px; left: 20px; }
.route-label-end { top: 118px; right: 17px; }
.auth-route-board h1 { position: absolute; bottom: 62px; left: 22px; margin: 0; font-size: 30px; font-weight: 750; line-height: 1.2; opacity: 0; animation: auth-rise 560ms 620ms cubic-bezier(.16,1,.3,1) forwards; }
.auth-route-board p { position: absolute; right: 22px; bottom: 28px; left: 22px; margin: 0; color: var(--cm-muted); font-size: 13px; opacity: 0; animation: auth-rise 560ms 710ms cubic-bezier(.16,1,.3,1) forwards; }
.auth-form-wrap { position: relative; margin-top: -12px; border: 1px solid rgba(10,125,115,.1); border-bottom: 0; border-radius: 12px 12px 0 0; background: rgba(255,255,255,.92); box-shadow: 0 -10px 32px rgba(28,50,42,.07); padding: 22px 14px 28px; animation: auth-form-in 640ms 160ms cubic-bezier(.16,1,.3,1) both; backdrop-filter: blur(18px); }
.auth-form { width: min(100%, 500px); margin: 0 auto; }
.form-heading { margin-bottom: 16px; padding: 0 2px; }
.form-heading h2 { margin: 0; color: var(--cm-ink); font-size: 23px; }
.form-heading p { margin: 5px 0 0; color: var(--cm-muted); font-size: 13px; }

@keyframes auth-route-draw { to { stroke-dashoffset: 0; } }
@keyframes auth-node-in { from { opacity: 0; transform: scale(.35); } to { opacity: 1; transform: scale(1); } }
@keyframes auth-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes auth-form-in { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
</style>
