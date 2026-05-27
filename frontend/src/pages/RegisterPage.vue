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
  <section class="page">
    <van-nav-bar title="注册" left-arrow @click-left="$router.push('/login')" />
    <div class="page-content">
      <van-form @submit="handleSubmit">
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
