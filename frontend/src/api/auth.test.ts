import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import { login, register } from './auth'

vi.mock('./request', () => ({
  default: {
    post: vi.fn()
  }
}))

vi.mock('@/auth/sessionTokens', () => ({
  isNativeAuthClient: () => false
}))

const user = {
  id: 1,
  student_id: '999999999999991',
  nickname: 'future',
  avatar_text: 'F',
  avatar_color: '#0b766f',
  role: 'student',
  created_at: '2026-08-12T00:00:00Z'
}

describe('auth api student identity contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers with one student id identity field', async () => {
    vi.mocked(request.post).mockResolvedValue({ data: user })

    await register({
      student_id: '999999999999991',
      nickname: 'future',
      password: 'secret123'
    })

    expect(request.post).toHaveBeenCalledWith('/api/auth/register', {
      student_id: '999999999999991',
      nickname: 'future',
      password: 'secret123'
    })
  })

  it('logs in with the student id and client kind', async () => {
    vi.mocked(request.post).mockResolvedValue({
      data: {
        access_token: 'access-token',
        token_type: 'bearer',
        expires_in: 1800,
        user
      }
    })

    await login({ student_id: '999999999999991', password: 'secret123' })

    expect(request.post).toHaveBeenCalledWith('/api/auth/login', {
      student_id: '999999999999991',
      password: 'secret123',
      client_kind: 'web'
    })
  })
})
