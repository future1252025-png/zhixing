import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getBuildings, type Building } from '@/api/buildings'
import { useBuildingsStore } from './buildings'

vi.mock('@/api/buildings', () => ({
  getBuildings: vi.fn()
}))

const buildings: Building[] = [
  {
    id: 2,
    name: '综合教学楼',
    type: '教学楼',
    description: '上课地点',
    latitude: 30.59,
    longitude: 114.33,
    map_x: 0,
    map_y: 0,
    walk_hint: null
  }
]

describe('buildings store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(getBuildings).mockResolvedValue(buildings)
  })

  it('requests buildings once and serves later calls from the cache', async () => {
    const store = useBuildingsStore()

    const first = await store.ensureLoaded()
    const second = await store.ensureLoaded()

    expect(first).toEqual(buildings)
    expect(second).toEqual(buildings)
    expect(getBuildings).toHaveBeenCalledTimes(1)
    expect(store.loaded).toBe(true)
  })

  it('shares one in-flight request between concurrent callers', async () => {
    const store = useBuildingsStore()

    const [first, second] = await Promise.all([
      store.ensureLoaded(),
      store.ensureLoaded()
    ])

    expect(first).toEqual(buildings)
    expect(second).toEqual(buildings)
    expect(getBuildings).toHaveBeenCalledTimes(1)
  })

  it('refetches after invalidate', async () => {
    const store = useBuildingsStore()
    await store.ensureLoaded()

    store.invalidate()
    expect(store.loaded).toBe(false)
    await store.ensureLoaded()

    expect(getBuildings).toHaveBeenCalledTimes(2)
  })

  it('records the failure and retries on the next call', async () => {
    vi.mocked(getBuildings).mockRejectedValueOnce({
      response: {
        status: 500,
        data: { detail: '楼栋数据暂时不可用' }
      }
    })
    const store = useBuildingsStore()

    await expect(store.ensureLoaded()).rejects.toBeTruthy()
    expect(store.errorMessage).toBe('楼栋数据暂时不可用')
    expect(store.loaded).toBe(false)
    expect(store.loading).toBe(false)

    await expect(store.ensureLoaded()).resolves.toEqual(buildings)
    expect(store.errorMessage).toBe('')
    expect(getBuildings).toHaveBeenCalledTimes(2)
  })
})
