import { describe, expect, it } from 'vitest'

import {
  buildCampusSearchKeywords,
  readCollectorDraft,
  writeCollectorDraft,
  type CollectorDraft
} from './mapCollector'

describe('map collector helpers', () => {
  it('builds broad campus search keywords beyond the old common list', () => {
    const keywords = buildCampusSearchKeywords()

    expect(keywords).toContain('湖北大学 教3')
    expect(keywords).toContain('湖北大学 3号教学楼')
    expect(keywords).toContain('湖北大学 实训大楼')
    expect(keywords).toContain('湖北大学 双创大楼')
    expect(keywords.length).toBeGreaterThan(30)
  })

  it('persists and restores collector draft data', () => {
    const storage = new Map<string, string>()
    const localStorageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
    const draft: CollectorDraft = {
      points: [
        {
          id: 'manual-1',
          name: '3号教学楼',
          type: '教学楼',
          address: '教3',
          latitude: 30.58,
          longitude: 114.32,
          gcjLatitude: 30.581,
          gcjLongitude: 114.321,
          source: 'click',
          selected: true
        }
      ],
      campusPolygonWgs: [
        { latitude: 30.58, longitude: 114.32 },
        { latitude: 30.581, longitude: 114.32 },
        { latitude: 30.581, longitude: 114.321 }
      ],
      boundaryMode: '手绘范围'
    }

    writeCollectorDraft(localStorageLike, draft)

    expect(readCollectorDraft(localStorageLike)).toEqual(draft)
  })
})
