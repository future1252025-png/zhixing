import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'
import { TABLET_PROXY_PATH, tabletProxyGuard, tabletProxyOptions } from './tools/tabletWebProxy'

// Separate development entry: production, Android and isolated E2E builds keep
// using the original Vite config and never inherit this local reverse proxy.
export default mergeConfig(base, defineConfig({
  plugins: [tabletProxyGuard()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
    allowedHosts: ['localhost'],
    proxy: { [TABLET_PROXY_PATH]: tabletProxyOptions() }
  }
}))
