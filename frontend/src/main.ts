import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  ActionSheet,
  Button,
  Cell,
  CellGroup,
  ConfigProvider,
  Empty,
  Field,
  Form,
  Icon,
  NavBar,
  Search,
  Tabbar,
  TabbarItem,
  showFailToast
} from 'vant'
import 'vant/lib/index.css'

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

app.use(Button)
app.use(ActionSheet)
app.use(Cell)
app.use(CellGroup)
app.use(ConfigProvider)
app.use(Empty)
app.use(Field)
app.use(Form)
app.use(Icon)
app.use(NavBar)
app.use(Search)
app.use(Tabbar)
app.use(TabbarItem)

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
