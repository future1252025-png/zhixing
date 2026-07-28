import { beforeEach, describe, expect, it, vi } from 'vitest'

const capacitorMocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  open: vi.fn()
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: capacitorMocks.isNativePlatform,
    getPlatform: capacitorMocks.getPlatform
  },
  registerPlugin: () => ({ open: capacitorMocks.open })
}))

import {
  captureHubuCourseTable,
  captureToHtmlFile,
  HUBU_ACADEMIC_SYSTEM_URL,
  supportsNativeHubuCourseImport
} from './hubuCourseImport'

describe('Hubu native course import bridge', () => {
  beforeEach(() => {
    capacitorMocks.isNativePlatform.mockReturnValue(false)
    capacitorMocks.getPlatform.mockReturnValue('web')
    capacitorMocks.open.mockReset()
  })

  it('only enables the bridge inside the native Android container', () => {
    expect(supportsNativeHubuCourseImport()).toBe(false)

    capacitorMocks.isNativePlatform.mockReturnValue(true)
    capacitorMocks.getPlatform.mockReturnValue('android')
    expect(supportsNativeHubuCourseImport()).toBe(true)
  })

  it('opens the fixed official address instead of accepting an arbitrary URL', async () => {
    capacitorMocks.isNativePlatform.mockReturnValue(true)
    capacitorMocks.getPlatform.mockReturnValue('android')
    capacitorMocks.open.mockResolvedValue({ cancelled: true })

    await captureHubuCourseTable()

    expect(capacitorMocks.open).toHaveBeenCalledWith({
      url: HUBU_ACADEMIC_SYSTEM_URL
    })
  })

  it('converts the captured DOM into the same immutable HTML file used by normal imports', async () => {
    const file = captureToHtmlFile({
      cancelled: false,
      filename: '2026-2027-1-课表.html',
      html: '<table><tr><th>星期一</th></tr></table>'
    })

    expect(file.name).toBe('2026-2027-1-课表.html')
    expect(file.type).toBe('text/html;charset=utf-8')
    expect(file.size).toBeGreaterThan(20)
  })
})
