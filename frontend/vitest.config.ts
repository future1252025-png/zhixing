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
        // 统计全部生产代码，而不是只统计测试恰好导入的文件。
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/**/*.d.ts',
          'src/**/*.test.{ts,tsx}',
          'src/test/**',
          'src/main.ts'
        ],
        thresholds: {
          // 以当前全量统计结果作为诚实基线，后续只允许提高，不允许回退。
          statements: 60,
          branches: 62,
          functions: 57,
          lines: 61
        }
      }
    }
  })
)
