<script setup lang="ts">
import { reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const submitting = ref(false)
const form = reactive({
  username: '',
  password: ''
})

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      return detail
    }
  }
  return '登录失败，请检查账号或密码'
}

async function handleSubmit() {
  submitting.value = true
  try {
    await authStore.login(form)
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
  <section class="page auth-page">
    <van-nav-bar title="登录" />
    <div class="page-content auth-content">
      <section class="hero-panel auth-hero">
        <span class="hero-eyebrow">CampusMind</span>
        <h1 class="hero-title">智行，安排好今天的校园路程</h1>
        <p class="hero-copy">登录后查看建筑留言、管理课程表，并生成下一节课出发建议。</p>
      </section>

      <van-form class="auth-form surface-panel" @submit="handleSubmit">
        <div class="form-heading">
          <h2>欢迎回来</h2>
          <p>使用模拟校园账号进入演示系统</p>
        </div>
        <van-cell-group inset>
          <van-field
            v-model="form.username"
            name="username"
            label="用户名"
            placeholder="请输入用户名"
            autocomplete="username"
            :rules="[{ required: true, message: '请输入用户名' }]"
          />
          <van-field
            v-model="form.password"
            type="password"
            name="password"
            label="密码"
            placeholder="请输入密码"
            autocomplete="current-password"
            :rules="[{ required: true, message: '请输入密码' }]"
          />
        </van-cell-group>
        <div class="page-actions">
          <van-button type="primary" native-type="submit" block :loading="submitting">
            登录
          </van-button>
          <router-link to="/register">
            <van-button plain block>创建账号</van-button>
          </router-link>
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
  min-height: 178px;
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
