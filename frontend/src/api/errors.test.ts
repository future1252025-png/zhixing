import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  extractBusinessError,
  notifyUnauthorizedOnce,
  resetUnauthorizedState,
  setUnauthorizedHandler
} from './errors'

describe('API errors', () => {
  beforeEach(() => {
    resetUnauthorizedState()
  })

  it('extracts the backend business error contract', () => {
    expect(
      extractBusinessError({
        response: {
          status: 409,
          data: {
            code: 'course_conflict',
            message: '该时间与已有课程冲突',
            fields: ['weeks'],
            details: { overlap_weeks: [2] }
          }
        }
      })
    ).toEqual({
      status: 409,
      code: 'course_conflict',
      message: '该时间与已有课程冲突',
      fields: ['weeks'],
      details: { overlap_weeks: [2] }
    })
  })

  it('falls back to the FastAPI detail string when no structured error exists', () => {
    expect(
      extractBusinessError({
        response: {
          status: 403,
          data: { detail: '当前位置距离建筑过远' }
        }
      })
    ).toEqual({
      status: 403,
      code: 'unexpected_error',
      message: '当前位置距离建筑过远',
      fields: [],
      details: {}
    })
  })

  it('prefers the structured business error over a detail string', () => {
    expect(
      extractBusinessError({
        response: {
          status: 409,
          data: {
            code: 'course_conflict',
            message: '该时间与已有课程冲突',
            fields: [],
            details: {},
            detail: 'legacy detail'
          }
        }
      }).message
    ).toBe('该时间与已有课程冲突')
  })

  it.each<[unknown, number]>([
    [null, 0],
    [{ response: { status: 500, data: { detail: '   ' } } }, 500],
    [{ response: { status: 500, data: { detail: 42 } } }, 500],
    [{
      response: {
        status: 422,
        data: { code: 'bad', message: 'bad', fields: 'weeks', details: {} }
      }
    }, 422],
    [{
      response: {
        status: 422,
        data: { code: 'bad', message: 'bad', fields: [], details: [] }
      }
    }, 422]
  ])('returns a safe fallback for malformed payload %#', (error, status) => {
    expect(extractBusinessError(error)).toEqual({
      status,
      code: 'unexpected_error',
      message: '操作失败，请稍后重试',
      fields: [],
      details: {}
    })
  })

  it('runs one unauthorized recovery for concurrent and later 401 responses', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setUnauthorizedHandler(handler)

    await Promise.all([
      notifyUnauthorizedOnce(),
      notifyUnauthorizedOnce(),
      notifyUnauthorizedOnce()
    ])
    await notifyUnauthorizedOnce()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('allows the next real session expiration after reset', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    setUnauthorizedHandler(handler)

    await notifyUnauthorizedOnce()
    resetUnauthorizedState()
    await notifyUnauthorizedOnce()

    expect(handler).toHaveBeenCalledTimes(2)
  })
})
