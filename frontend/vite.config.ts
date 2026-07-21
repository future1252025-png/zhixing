import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import { SPA_SECURITY_HEADERS } from './src/config/securityHeaders'

export { SPA_SECURITY_HEADERS }

export default defineConfig({
  plugins: [vue()],
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
