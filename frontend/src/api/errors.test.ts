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

  it('localizes known business errors returned by an older backend', () => {
    expect(
      extractBusinessError({
        response: {
          status: 409,
          data: {
            code: 'semester_unconfigured',
            message: 'Semester is not configured',
            fields: [],
            details: {}
          }
        }
      }).message
    ).toBe('尚未设置学期，请先完成学期设置')
  })

  it.each([
    [405, '/api/courses/makeups'],
    [404, 'https://campus.example/api/courses/makeups?retry=1'],
    [405, '/api/courses/makeups/12'],
    [404, '/api/courses/makeups/batches/test-batch']
  ])('explains an unavailable makeup endpoint (%s, %s)', (status, url) => {
    const result = extractBusinessError({ config: { url }, response: { status, data: { detail: 'Method Not Allowed' } } })
    expect(result.code).toBe('makeup_api_unavailable')
    expect(result.message).toContain('平板后端已更新')
    expect(result.status).toBe(status)
  })

  it('also reads the request URL from the response config', () => {
    expect(extractBusinessError({ response: { status: 405, config: { url: '/api/courses/makeups' } } }).code)
      .toBe('makeup_api_unavailable')
  })

  it('preserves a real missing course error on the makeup endpoint', () => {
    expect(extractBusinessError({ config: { url: '/api/courses/makeups' }, response: { status: 404,
      data: { code: 'course_not_found', message: '课程不存在', fields: [], details: {} }
    } }).code).toBe('course_not_found')
  })

  it.each([
    [405, '/api/courses'], [404, '/api/courses/makeups-other'], [500, '/api/courses/makeups'], [401, '/api/courses/makeups']
  ])('does not mislabel other failures (%s, %s)', (status, url) => {
    expect(extractBusinessError({ config: { url }, response: { status, data: { detail: 'original message' } } }).message)
      .toBe('original message')
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
