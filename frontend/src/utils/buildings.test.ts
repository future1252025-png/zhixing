import { describe, expect, it } from 'vitest'

import { filterBuildingsByKeyword, formatBuildingDisplayName } from './buildings'

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
  it('removes Hubu Wuchang campus prefixes from display names only', () => {
    expect(formatBuildingDisplayName('湖北大学（武昌主校区）双创大楼A座')).toBe('双创大楼A座')
    expect(formatBuildingDisplayName('湖北大学(武昌校区)-教4')).toBe('教4')
    expect(formatBuildingDisplayName('湖北大学武昌校区图书馆')).toBe('图书馆')
    expect(formatBuildingDisplayName('湖北大学武昌主校区 教育超市')).toBe('教育超市')
    expect(formatBuildingDisplayName('湖北大学-商务住宅')).toBe('商务住宅')
    expect(formatBuildingDisplayName('逸夫人文楼')).toBe('逸夫人文楼')
  })

  it('keeps a campus-only name instead of returning an empty label', () => {
    expect(formatBuildingDisplayName('湖北大学（武昌校区）')).toBe('湖北大学（武昌校区）')
  })

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
