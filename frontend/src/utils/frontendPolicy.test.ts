import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SPA_SECURITY_HEADERS } from '@/config/securityHeaders'

const FRONTEND_ROOT = existsSync(resolve(process.cwd(), 'vite.config.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'frontend')

function frontendFile(path: string): string {
  return readFileSync(resolve(FRONTEND_ROOT, path), 'utf8')
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.match(/[a-f\d]{2}/gi)!.map((value) => Number.parseInt(value, 16) / 255)
    const linear = channels.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    )
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

describe('mobile input policy', () => {
  it('keeps the audited CourseForm controls at least 16px high and 44px tall', () => {
    const source = frontendFile('src/pages/CourseFormPage.vue')
    expect(source).toMatch(/\.form-select,[\s\S]*?min-height:\s*44px;[\s\S]*?font-size:\s*16px;/)
  })

  it('keeps import mapping controls at least 16px high and 44px tall', () => {
    const source = frontendFile('src/components/import/ImportCandidateCard.vue')
    expect(source).toMatch(/\.mapping-panel select,[\s\S]*?\.mapping-panel input \{[\s\S]*?min-height:\s*4[4-9]px;[\s\S]*?font-size:\s*16px;/)
  })

  it('provides a coarse-pointer fallback for text fields, selects and textareas', () => {
    const source = frontendFile('src/styles/base.css')
    expect(source).toContain('@media (hover: none) and (pointer: coarse)')
    expect(source).toMatch(/textarea[\s\S]*?select[\s\S]*?\{[\s\S]*?min-height:\s*44px;[\s\S]*?font-size:\s*16px\s*!important;/)
  })

  it('keeps Vant authentication and message inputs at mobile-safe sizes', () => {
    expect(frontendFile('src/pages/LoginPage.vue')).toMatch(/\.auth-form :deep\(\.van-cell\)[\s\S]*?min-height:\s*5[8-9]px;[\s\S]*?\.auth-form :deep\(\.van-field__control\)[\s\S]*?font-size:\s*16px/)
    expect(frontendFile('src/pages/RegisterPage.vue')).toMatch(/\.register-card :deep\(\.van-cell\)[\s\S]*?min-height:\s*5[7-9]px;[\s\S]*?\.register-card :deep\(\.van-field__control\)[\s\S]*?font-size:\s*16px/)
    expect(frontendFile('src/pages/BuildingMessagesPage.vue')).toMatch(/\.message-composer :deep\(\.van-cell\)[\s\S]*?min-height:\s*4[8-9]px;[\s\S]*?\.message-composer :deep\(\.van-field__control\)[\s\S]*?font-size:\s*16px/)
  })

  it('keeps the building message composer wired to the lifecycle-aware inset', () => {
    const source = frontendFile('src/pages/BuildingMessagesPage.vue')
    expect(source).toContain('const { keyboardInset } = useKeyboardInset()')
    expect(source).toContain('const composerLift = computed(() => Math.max(0, keyboardInset.value))')
  })

  it('keeps both RealCampusMap search themes at 16px', () => {
    const matches = frontendFile('src/components/RealCampusMap.vue').match(/\.map-search :deep\(\.van-field__control\) \{[\s\S]*?font-size:\s*16px;/g)
    expect(matches).toHaveLength(2)
  })

  it('overrides MapCollector scoped sizing for all four input and select controls', () => {
    const source = frontendFile('src/pages/MapCollectorPage.vue')
    expect(source.match(/class="collector-input"/g)).toHaveLength(4)
    expect(source).toMatch(/\.collector-input \{[\s\S]*?min-height:\s*44px;[\s\S]*?font-size:\s*16px;/)
  })
})

describe('readability policy', () => {
  it.each([
    ['#635b6b', '#fffdf8'],
    ['#68716a', '#faf8f1'],
    ['#5f6e62', '#fffdf7']
  ])('keeps %s readable on %s', (foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('applies the audited readable colors to their small-text surfaces', () => {
    expect(frontendFile('src/pages/BuildingMessagesPage.vue')).toContain('.heading-copy small { color: #635b6b;')
    expect(frontendFile('src/components/import/ImportCandidateCard.vue')).toContain('.panel-title small { color: #68716a; font-size: 12px; }')
    expect(frontendFile('src/components/RealCampusMap.vue')).toContain('.map-selected-card div > span { color: #5f6e62;')
  })

  it('uses the backend channel name and no stale public-channel label', () => {
    const source = frontendFile('src/pages/BuildingMessagesPage.vue')
    expect(source).toContain("selectedRoomName.value || '建筑总聊'")
    expect(source).not.toContain('建筑公共频道')
  })

  it('keeps course time text at 12px or larger', () => {
    expect(frontendFile('src/pages/CoursesPage.vue')).toMatch(/\.time-cell time \{[\s\S]*?font-size:\s*12px;/)
  })
})

describe('SPA response security headers', () => {
  const expected = {
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }

  it('sets equivalent headers in Vite dev and preview', () => {
    const headerSource = frontendFile('src/config/securityHeaders.ts')
    const viteSource = frontendFile('vite.config.ts')
    expect(SPA_SECURITY_HEADERS).toEqual(expected)
    expect(headerSource).toContain('SPA_SECURITY_HEADERS')
    expect(viteSource).toMatch(/server:\s*\{[\s\S]*?headers:\s*SPA_SECURITY_HEADERS/)
    expect(viteSource).toMatch(/preview:\s*\{[\s\S]*?headers:\s*SPA_SECURITY_HEADERS/)
  })

  it('ships the static hosting header policy with the production build inputs', () => {
    const headers = frontendFile('public/_headers')
    for (const [name, value] of Object.entries(expected)) {
      expect(headers).toContain(`${name}: ${value}`)
    }
    const deployment = frontendFile('DEPLOYMENT.md')
    expect(deployment).toContain('Nginx')
    expect(deployment).toContain('CDN')
    expect(deployment).toContain('frame-ancestors')
    expect(deployment).toContain('Referrer-Policy: strict-origin-when-cross-origin')
  })
})
