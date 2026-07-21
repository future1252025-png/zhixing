import type { BusinessError } from '@/types/api'

type UnauthorizedHandler = () => Promise<void>

let unauthorizedHandler: UnauthorizedHandler | null = null
let unauthorizedPromise: Promise<void> | null = null
let unauthorizedHandled = false

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
      message: data.message,
      fields: [...data.fields],
      details: data.details
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
