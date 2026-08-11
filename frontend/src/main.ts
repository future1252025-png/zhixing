import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { showFailToast } from 'vant'
// 函数式调用组件（showToast/showConfirmDialog 等）不经模板解析，需手动引入样式
import 'vant/es/toast/style/index'
import 'vant/es/dialog/style/index'
// 品牌楷体：GB 字符集 + unicode-range 分片，浏览器只下载用到的分片；
// 保证 Android（无内置楷体）上标题不回退为黑体
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css'

import App from './App.vue'
import revealDirective from './directives/reveal'
import router from './router'
import { setUnauthorizedHandler } from './api/errors'
import { useAuthStore } from './stores/auth'
import { installVanFieldFocusDelegation } from './utils/vanFieldFocus'
import './styles/base.css'
import './styles/fresh.css'

// 旧版本把课表浏览周当成全局真实周；新版本由后端学期状态统一裁决。
localStorage.removeItem('campusmind-selected-week')
installVanFieldFocusDelegation()

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add(
    'capacitor-native',
    `capacitor-${Capacitor.getPlatform()}`
  )
}

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
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

  // Access tokens are memory-only. Restore a valid session from the HttpOnly
  // web cookie or Android Keystore before the router evaluates auth guards.
  await useAuthStore(pinia).restoreSession()

  app.use(router)
  app.mount('#app')
}

void bootstrap()
