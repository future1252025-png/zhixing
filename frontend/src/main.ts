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
  TabbarItem
} from 'vant'
import 'vant/lib/index.css'

import App from './App.vue'
import revealDirective from './directives/reveal'
import router from './router'
import './styles/base.css'

const app = createApp(App)

app.use(createPinia())
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

app.mount('#app')
