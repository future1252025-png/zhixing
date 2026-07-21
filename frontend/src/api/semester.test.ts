import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import { fetchSemester, saveSemester } from './semester'

vi.mock('./request', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn()
  }
}))

const semester = {
  status: 'active' as const,
  start_date: '2026-08-31',
  total_weeks: 20,
  current_week: 4
}

describe('semester api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the current user semester', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: semester })

    await expect(fetchSemester()).resolves.toEqual(semester)
    expect(request.get).toHaveBeenCalledWith('/api/semester')
  })

  it('saves a semester setting', async () => {
    vi.mocked(request.put).mockResolvedValue({ data: semester })
    const payload = { start_date: '2026-08-31', total_weeks: 20 }

    await expect(saveSemester(payload)).resolves.toEqual(semester)
    expect(request.put).toHaveBeenCalledWith('/api/semester', payload)
  })
})
