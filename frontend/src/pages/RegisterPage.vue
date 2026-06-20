<script setup lang="ts">
import { reactive, ref } from 'vue'
import { isAxiosError } from 'axios'
import { showFailToast, showSuccessToast } from 'vant'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const submitting = ref(false)
const form = reactive({ username: '', password: '', nickname: '', student_id: '' })

function getErrorMessage(error: unknown): string {
  if (isAxiosError(error) && typeof error.response?.data?.detail === 'string') return error.response.data.detail
  return '注册失败，请稍后重试'
}

async function handleSubmit() {
  submitting.value = true
  try {
    await authStore.register({ username: form.username, password: form.password, nickname: form.nickname, student_id: form.student_id || null })
    showSuccessToast('注册成功，请登录')
    await router.replace('/login')
  } catch (error) { showFailToast(getErrorMessage(error)) } finally { submitting.value = false }
}
</script>

<template>
  <section class="page auth-register-page">
    <van-nav-bar title="创建账号" left-arrow @click-left="router.push('/login')" />
    <div class="page-content register-content">
      <header class="register-heading">
        <span>01 / 创建账号</span>
        <h1>先建立你的校园日程档案。</h1>
        <p>第一版使用模拟校园账号，不会连接湖北大学统一身份认证。</p>
      </header>
      <div class="register-route" aria-hidden="true"><i></i><b></b><i></i><b></b><i></i></div>
      <van-form class="register-form" @submit="handleSubmit">
        <van-cell-group inset>
          <van-field v-model="form.username" name="username" label="用户名" placeholder="3 到 64 个字符" autocomplete="username" :rules="[{ required: true, message: '请输入用户名' }]" />
          <van-field v-model="form.nickname" name="nickname" label="昵称" placeholder="用于个人中心展示" :rules="[{ required: true, message: '请输入昵称' }]" />
          <van-field v-model="form.student_id" name="student_id" label="学号" placeholder="可选" />
          <van-field v-model="form.password" type="password" name="password" label="密码" placeholder="至少 6 位" autocomplete="new-password" :rules="[{ required: true, message: '请输入密码' }]" />
        </van-cell-group>
        <div class="page-actions"><van-button type="primary" native-type="submit" block :loading="submitting">创建账号</van-button></div>
      </van-form>
    </div>
  </section>
</template>

<style scoped>
.register-content { padding-top: 26px; }
.register-heading span { color: var(--cm-primary); font-size: 12px; font-weight: 700; }
.register-heading h1 { max-width: 340px; margin: 10px 0 8px; font-size: 28px; line-height: 1.2; }
.register-heading p { margin: 0; color: var(--cm-muted); font-size: 14px; line-height: 1.6; }
.register-route { display: flex; align-items: center; margin: 24px 3px; }
.register-route i { width: 12px; height: 12px; border: 3px solid #fff; border-radius: 50%; background: var(--cm-primary); box-shadow: 0 0 0 1px var(--cm-primary); }
.register-route i:nth-of-type(2) { background: var(--cm-blue); box-shadow: 0 0 0 1px var(--cm-blue); }
.register-route i:nth-of-type(3) { background: var(--cm-amber); box-shadow: 0 0 0 1px var(--cm-amber); }
.register-route b { height: 3px; flex: 1; background: var(--cm-line-strong); }
.register-form { padding-bottom: 24px; }
</style>
