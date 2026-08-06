import { Capacitor, registerPlugin } from '@capacitor/core'

export const HUBU_ACADEMIC_SYSTEM_URL = 'https://jwxt.hubu.edu.cn/jsxsd/'

export interface HubuCourseCapture {
  cancelled: boolean
  filename?: string
  html?: string
  sourceUrl?: string
  pageTitle?: string
}

interface HubuCourseImportPlugin {
  open(options: { url: string }): Promise<HubuCourseCapture>
}

const HubuCourseImport = registerPlugin<HubuCourseImportPlugin>('HubuCourseImport')

export function supportsNativeHubuCourseImport(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function captureHubuCourseTable(): Promise<HubuCourseCapture> {
  if (!supportsNativeHubuCourseImport()) {
    return { cancelled: true }
  }

  return HubuCourseImport.open({ url: HUBU_ACADEMIC_SYSTEM_URL })
}

export function captureToHtmlFile(capture: HubuCourseCapture): File {
  if (!capture.html?.trim()) {
    throw new Error('教务系统没有返回可读取的课表内容')
  }

  const safeFilename = capture.filename?.trim() || '湖北大学教务系统课表.html'
  return new File([capture.html], safeFilename, {
    type: 'text/html;charset=utf-8',
    lastModified: Date.now()
  })
}
