// Render the existing leaf identity as PNGs for browser/Apple home-screen icons.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined })
try {
  const page = await browser.newPage()
  const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
  for (const [size, file] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>html,body{margin:0;background:#4f7d58;width:100%;height:100%}svg{width:100%;height:100%;display:block}</style>${svg}`)
    await page.screenshot({ path: fileURLToPath(new URL(`../public/icons/${file}`, import.meta.url)) })
  }
} finally { await browser.close() }
