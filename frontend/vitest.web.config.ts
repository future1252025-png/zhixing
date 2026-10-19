import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', clearMocks: true,
  include: ['tools/amapProxy.test.ts', 'tools/webRouting.test.ts', 'tools/webProduction.test.mjs'] } })
