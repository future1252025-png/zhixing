import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { showFailToast } from 'vant'
// 函数式调用组件（showToast/showConfirmDialog 等）不经模板解析，需手动引入样式
import 'vant/es/toast/style/index'
import 'vant/es/dialog/style/index'

import App from './App.vue'
import revealDirective from './directives/reveal'
import router from './router'
import { setUnauthorizedHandler } from './api/errors'
import { useAuthStore } from './stores/auth'
import './styles/base.css'
import './styles/fresh.css'

// 旧版本把课表浏览周当成全局真实周；新版本由后端学期状态统一裁决。
localStorage.removeItem('campusmind-selected-week')

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.directive('reveal', revealDirective)

setUnauthorizedHandler(async () => {
  const auth = useAuthStore(pinia)
  const currentRoute = router.currentRoute.value
  const redirect = currentRoute.fullPath
  auth.clearSession()
  if (currentRoute.name !== 'login') {
    showFailToast('登录已过期，请重新登录')
    await router.replace({
      name: 'login',
      query: { redirect, reason: 'expired' }
    })
  }
})

app.mount('#app')
