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

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5179',
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: `"${python}" tools/run_e2e_server.py`,
      cwd: backendDir,
      url: 'http://127.0.0.1:8010/health',
      reuseExistingServer: false,
      timeout: 120_000
    },
    {
      command: 'npm run dev:e2e',
      cwd: frontendDir,
      url: 'http://127.0.0.1:5179',
      reuseExistingServer: false,
      timeout: 120_000
    }
  ],
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 }
      }
    }
  ]
})
