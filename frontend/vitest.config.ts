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
      exclude: ['e2e/**', 'functions/**', 'tools/amapProxy.test.ts', 'tools/webRouting.test.ts', 'tools/webProduction.test.mjs', '**/node_modules/**', '**/dist/**', '**/test-results/**'],
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
          // 覆盖率门槛基于全量生产源码统计。
          statements: 60,
          branches: 62,
          functions: 57,
          lines: 61
        }
      }
    }
  })
)
