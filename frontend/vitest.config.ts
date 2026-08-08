import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'

import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      clearMocks: true,
      exclude: ['e2e/**', '**/node_modules/**', '**/dist/**', '**/test-results/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        thresholds: {
          statements: 78,
          branches: 75,
          functions: 76,
          lines: 80
        }
      }
    }
  })
)
