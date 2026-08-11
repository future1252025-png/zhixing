import type { BusinessError } from '@/types/api'

type UnauthorizedHandler = () => Promise<void>

let unauthorizedHandler: UnauthorizedHandler | null = null
let unauthorizedPromise: Promise<void> | null = null
let unauthorizedHandled = false

const BUSINESS_ERROR_FALLBACKS: Readonly<Record<string, string>> = {
  semester_unconfigured: '尚未设置学期，请先完成学期设置',
  course_not_found: '课程不存在',
  building_not_found: '建筑不存在',
  invalid_room_name: '上课地点尚未确认，请选择或填写有效地点',
  user_not_found: '用户不存在'
}

function localizedBusinessMessage(code: string, message: string): string {
  // 新后端直接返回中文；此映射同时兼容仍缓存旧英文响应的网页或 APK。
  return /[\u3400-\u9fff]/u.test(message) ? message : (BUSINESS_ERROR_FALLBACKS[code] ?? message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function responseStatus(error: unknown): number {
  if (!isRecord(error) || !isRecord(error.response)) return 0
  return typeof error.response.status === 'number' ? error.response.status : 0
}

export function extractBusinessError(error: unknown): BusinessError {
  const status = responseStatus(error)
  const response = isRecord(error) && isRecord(error.response) ? error.response : null
  const data = response && isRecord(response.data) ? response.data : null
  if (
    data &&
    typeof data.code === 'string' &&
    data.code.length > 0 &&
    typeof data.message === 'string' &&
    data.message.length > 0 &&
    Array.isArray(data.fields) &&
    data.fields.every((field) => typeof field === 'string') &&
    isRecord(data.details)
  ) {
    return {
      status,
      code: data.code,
      message: localizedBusinessMessage(data.code, data.message),
      fields: [...data.fields],
      details: data.details
    }
  }
  if (data && typeof data.detail === 'string' && data.detail.trim().length > 0) {
    // FastAPI 默认错误只带 detail 字符串，作为兜底文案透出。
    return {
      status,
      code: 'unexpected_error',
      message: data.detail,
      fields: [],
      details: {}
    }
  }
  return {
    status,
    code: 'unexpected_error',
    message: '操作失败，请稍后重试',
    fields: [],
    details: {}
  }
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler
}

export function notifyUnauthorizedOnce(): Promise<void> {
  if (!unauthorizedHandler) return Promise.resolve()
  if (unauthorizedHandled) return unauthorizedPromise ?? Promise.resolve()

  unauthorizedHandled = true
  const pending = Promise.resolve().then(() => unauthorizedHandler?.())
  const tracked = pending.then(() => undefined).finally(() => {
    if (unauthorizedPromise === tracked) {
      unauthorizedPromise = null
    }
  })
  unauthorizedPromise = tracked
  return tracked
}

export function resetUnauthorizedState(): void {
  unauthorizedPromise = null
  unauthorizedHandled = false
}
