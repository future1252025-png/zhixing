<script setup lang="ts">
import { reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const submitting = ref(false)
const form = reactive({
  username: '',
  password: '',
  nickname: '',
  student_id: ''
})

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
  }
  return '注册失败，请稍后重试'
}

async function handleSubmit() {
  submitting.value = true
  try {
    await authStore.register({
      username: form.username,
      password: form.password,
      nickname: form.nickname,
      student_id: form.student_id || null
    })
    showSuccessToast('注册成功，请登录')
    await router.replace('/login')
  } catch (error) {
    showFailToast(getErrorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="page auth-page">
    <van-nav-bar title="注册" left-arrow @click-left="$router.push('/login')" />
    <div class="page-content auth-content">
      <section class="hero-panel auth-hero">
        <span class="hero-eyebrow">新同学入口</span>
        <h1 class="hero-title">创建账号，开始规划校园日程</h1>
        <p class="hero-copy">第一版使用模拟账号登录，适合课程设计演示和本地体验。</p>
      </section>

      <van-form class="auth-form surface-panel" @submit="handleSubmit">
        <div class="form-heading">
          <h2>账号信息</h2>
          <p>用户名、昵称和密码用于演示登录</p>
        </div>
        <van-cell-group inset>
          <van-field
            v-model="form.username"
            name="username"
            label="用户名"
            placeholder="3 到 64 个字符"
            autocomplete="username"
            :rules="[{ required: true, message: '请输入用户名' }]"
          />
          <van-field
            v-model="form.nickname"
            name="nickname"
            label="昵称"
            placeholder="请输入昵称"
            :rules="[{ required: true, message: '请输入昵称' }]"
          />
          <van-field
            v-model="form.student_id"
            name="student_id"
            label="学号"
            placeholder="可选"
          />
          <van-field
            v-model="form.password"
            type="password"
            name="password"
            label="密码"
            placeholder="至少 6 位"
            autocomplete="new-password"
            :rules="[{ required: true, message: '请输入密码' }]"
          />
        </van-cell-group>
        <div class="page-actions">
          <van-button type="primary" native-type="submit" block :loading="submitting">
            注册
          </van-button>
        </div>
      </van-form>
    </div>
  </section>
</template>

<style scoped>
.auth-content {
  display: grid;
  gap: 14px;
  padding-top: 10px;
}

.auth-hero {
  min-height: 168px;
}

.auth-form {
  padding: 14px 0 16px;
}

.form-heading {
  padding: 0 16px 12px;
}

.form-heading h2 {
  margin: 0;
  color: var(--cm-ink);
  font-size: 20px;
}

.form-heading p {
  margin: 5px 0 0;
  color: var(--cm-muted);
  font-size: 13px;
}

.auth-form :deep(.van-cell-group--inset) {
  box-shadow: none;
}

.auth-form .page-actions {
  padding: 0 16px;
}
</style>
