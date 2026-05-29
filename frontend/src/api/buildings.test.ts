import { beforeEach, describe, expect, it, vi } from 'vitest'

import request from './request'
import {
  getBuildingDetail,
  getBuildings,
  getLocationPresets
} from './buildings'

vi.mock('./request', () => ({
  default: {
    get: vi.fn()
  }
}))

const building = {
  id: 1,
  name: '图书馆',
  type: '图书馆',
  description: '主要自习与借阅空间',
  latitude: 30.5812,
  longitude: 114.3221,
  map_x: 52,
  map_y: 36,
  walk_hint: '靠近教学区'
}

describe('building api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches building list', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: [building] })

    const result = await getBuildings()

    expect(request.get).toHaveBeenCalledWith('/api/buildings')
    expect(result[0].name).toBe('图书馆')
  })

  it('fetches building detail by id', async () => {
    vi.mocked(request.get).mockResolvedValue({ data: building })

    const result = await getBuildingDetail(1)

    expect(request.get).toHaveBeenCalledWith('/api/buildings/1')
    expect(result.id).toBe(1)
  })

  it('fetches location presets', async () => {
    vi.mocked(request.get).mockResolvedValue({
      data: [
        {
          id: 1,
          name: '学生宿舍区',
          building_id: 10,
          building_name: '学生宿舍区',
          latitude: 30.588,
          longitude: 114.323,
          description: '演示从宿舍去上课'
        }
      ]
    })

    const result = await getLocationPresets()

    expect(request.get).toHaveBeenCalledWith('/api/location-presets')
    expect(result[0].building_name).toBe('学生宿舍区')
  })
})
