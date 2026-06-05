import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Button,
  Cell,
  CellGroup,
  ConfigProvider,
  Empty,
  Field,
  Form,
  NavBar,
  Search,
  Tabbar,
  TabbarItem
} from 'vant'
import 'vant/lib/index.css'

import App from './App.vue'
import router from './router'
import './styles/base.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.use(Button)
app.use(Cell)
app.use(CellGroup)
app.use(ConfigProvider)
app.use(Empty)
app.use(Field)
app.use(Form)
app.use(NavBar)
app.use(Search)
app.use(Tabbar)
app.use(TabbarItem)

app.mount('#app')
