import { describe, expect, it } from 'vitest'

import type { Building } from '@/api/buildings'

import { filterMapBuildings } from './mapSearch'

const buildings: Building[] = [
  {
    id: 1,
    name: '湖北大学武昌校区图书馆',
    type: '校园地点',
    description: '图书馆',
    latitude: 30.581,
    longitude: 114.329,
    map_x: 52,
    map_y: 42,
    walk_hint: null
  },
  {
    id: 2,
    name: '风华园食堂',
    type: '餐饮服务',
    description: '食堂',
    latitude: 30.577,
    longitude: 114.328,
    map_x: 48,
    map_y: 68,
    walk_hint: null
  },
  {
    id: 3,
    name: '湖北大学武昌校区计算机学院',
    type: '校园地点',
    description: '学院',
    latitude: 30.58,
    longitude: 114.326,
    map_x: 30,
    map_y: 54,
    walk_hint: null
  }
]

describe('map search helpers', () => {
  it('returns matching buildings by name, type or description', () => {
    expect(filterMapBuildings(buildings, '图书馆').map((item) => item.id)).toEqual([1])
    expect(filterMapBuildings(buildings, '餐饮').map((item) => item.id)).toEqual([2])
    expect(filterMapBuildings(buildings, '学院').map((item) => item.id)).toEqual([3])
  })

  it('trims empty search text and limits results', () => {
    expect(filterMapBuildings(buildings, '')).toEqual([])
    expect(filterMapBuildings(buildings, '湖北大学', 1).map((item) => item.id)).toEqual([1])
  })
})
