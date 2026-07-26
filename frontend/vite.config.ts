import { fileURLToPath, URL } from 'node:url'

import { VantResolver } from '@vant/auto-import-resolver'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

import { SPA_SECURITY_HEADERS } from './src/config/securityHeaders'

export { SPA_SECURITY_HEADERS }

// vitest 会通过 mergeConfig 复用本配置（无法合并函数式配置），因此用环境变量区分测试环境
const isVitest = process.env.VITEST === 'true'

export default defineConfig({
  plugins: [
    vue(),
    // vant 组件按需引入：模板中的 <van-*> 自动注册并只带入对应样式。
    // 测试环境（jsdom）无法加载按需注入的 css 副作用，沿用既有的组件 stub 机制。
    ...(isVitest
      ? []
      : [
          Components({
            dirs: [],
            dts: false,
            resolvers: [VantResolver()]
          })
        ])
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    headers: SPA_SECURITY_HEADERS
  },
  preview: {
    headers: SPA_SECURITY_HEADERS
  }
})
