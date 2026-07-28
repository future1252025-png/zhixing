import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const frontendDir = dirname(fileURLToPath(import.meta.url))
const backendDir = resolve(frontendDir, '../backend')
const localPython = process.platform === 'win32'
  ? resolve(backendDir, '.venv/Scripts/python.exe')
  : resolve(backendDir, '.venv/bin/python')
const sharedPython = process.platform === 'win32'
  ? resolve(frontendDir, '../../../backend/.venv/Scripts/python.exe')
  : resolve(frontendDir, '../../../backend/.venv/bin/python')
const python = process.env.E2E_PYTHON
  ?? (existsSync(localPython) ? localPython : existsSync(sharedPython) ? sharedPython : 'python')
const viewport = {
  width: Number.parseInt(process.env.E2E_VIEWPORT_WIDTH ?? '390', 10),
  height: Number.parseInt(process.env.E2E_VIEWPORT_HEIGHT ?? '844', 10)
}
const reuseExistingServer = process.env.E2E_REUSE_SERVER === 'true'

export default defineConfig({
  testDir: './e2e',
  // Keep screenshots/traces outside Vite's frontend root. Writing artifacts
  // under frontend/ can trigger a dev-server full reload during the journey.
  outputDir: resolve(frontendDir, '../.e2e-artifacts/test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5179',
    viewport,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: `"${python}" tools/run_e2e_server.py`,
      cwd: backendDir,
      url: 'http://127.0.0.1:8010/health',
      reuseExistingServer,
      timeout: 120_000
    },
    {
      command: 'npm run serve:e2e',
      cwd: frontendDir,
      url: 'http://127.0.0.1:5179',
      reuseExistingServer,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport
      }
    }
  ]
})
