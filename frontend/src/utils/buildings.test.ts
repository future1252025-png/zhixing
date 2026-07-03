import { describe, expect, it } from 'vitest'

import { filterBuildingsByKeyword } from './buildings'

const buildings = [
  {
    id: 1,
    name: '图书馆',
    type: '学习',
    description: '自习和借阅',
    walk_hint: '靠近中区'
  },
  {
    id: 2,
    name: '3号教学楼',
    type: '教学楼',
    description: '公共课教室',
    walk_hint: '靠近实训大楼'
  },
  {
    id: 3,
    name: '实训大楼',
    type: '实验楼',
    description: '数据中国实验室',
    walk_hint: '南侧入口'
  }
]

describe('building helpers', () => {
  it('returns a limited list when keyword is empty', () => {
    expect(filterBuildingsByKeyword(buildings, '', 2).map((item) => item.id)).toEqual([1, 2])
  })

  it('matches by building name first', () => {
    expect(filterBuildingsByKeyword(buildings, '3号').map((item) => item.id)).toEqual([2])
  })

  it('matches type, description, and walk hint for fuzzy search', () => {
    expect(filterBuildingsByKeyword(buildings, '实验室').map((item) => item.id)).toEqual([3])
    expect(filterBuildingsByKeyword(buildings, '教学楼').map((item) => item.id)).toEqual([2])
    expect(filterBuildingsByKeyword(buildings, '中区').map((item) => item.id)).toEqual([1])
  })
})
