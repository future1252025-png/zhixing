import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { Building } from '@/api/buildings'
import type { ImportCandidate } from '@/types/courseImport'

import ImportCandidateCard from './ImportCandidateCard.vue'

const buildings: Building[] = [
  {
    id: 3,
    name: '实训大楼',
    type: '实训楼',
    description: '',
    latitude: 30,
    longitude: 114,
    map_x: 0,
    map_y: 0,
    walk_hint: null
  }
]

const candidate: ImportCandidate = {
  row_ref: 'row-2',
  source: {
    raw_course_name: '数据分析',
    raw_weekday: '星期二',
    raw_time_or_section: '第1-2节',
    raw_teacher: '陈老师',
    raw_weeks: '1-16周',
    raw_location: '实训大楼423-425数据中国实验室1'
  },
  course_name: '数据分析',
  weekday: 2,
  start_time: '08:00',
  end_time: '09:40',
  teacher: '陈老师',
  weeks: '1-16',
  suggested_building_id: 3,
  suggested_building_name: '实训大楼',
  suggested_room_name: '423-425数据中国实验室1',
  errors: []
}

describe('ImportCandidateCard', () => {
  it('renders all file source fields as read-only text and mapping as controls', () => {
    const wrapper = mount(ImportCandidateCard, {
      props: {
        candidate,
        buildings,
        resolution: { building_id: 3, room_name: '423-425数据中国实验室1' },
        index: 1
      }
    })

    const rawLocation = wrapper.get('[data-testid="raw-location"]')
    expect(rawLocation.text()).toBe('实训大楼423-425数据中国实验室1')
    expect(rawLocation.find('input').exists()).toBe(false)
    expect(wrapper.get('[data-testid="raw-course-name"]').text()).toBe('数据分析')
    expect(wrapper.get('[data-testid="raw-weekday"]').text()).toBe('星期二')
    expect(wrapper.get('[data-testid="raw-time-or-section"]').text()).toBe('第1-2节')
    expect(wrapper.get('[data-testid="raw-teacher"]').text()).toBe('陈老师')
    expect(wrapper.get('[data-testid="raw-weeks"]').text()).toBe('1-16周')
    expect(wrapper.find('.building-picker .picker-trigger').exists()).toBe(true)
    expect(wrapper.find('[name="room_name"]').exists()).toBe(true)
  })

  it('emits only an execution mapping and never mutates the source', async () => {
    const wrapper = mount(ImportCandidateCard, {
      props: {
        candidate,
        buildings,
        resolution: { building_id: 3, room_name: '423-425数据中国实验室1' },
        index: 1
      }
    })

    await wrapper.get('[name="room_name"]').setValue('完整实验教室 423-425')

    expect(wrapper.emitted('update:resolution')?.at(-1)).toEqual([
      { building_id: 3, room_name: '完整实验教室 423-425' }
    ])
    expect(candidate.source.raw_location).toBe('实训大楼423-425数据中国实验室1')
  })

  it('shows issues with text and preserves long location wrapping', () => {
    const wrapper = mount(ImportCandidateCard, {
      props: {
        candidate: {
          ...candidate,
          suggested_room_name: null,
          errors: [{ code: 'room_missing', field: 'room_name', message: '原始地点缺少教室信息' }]
        },
        buildings,
        resolution: { building_id: 3, room_name: '' },
        index: 1
      }
    })
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/import/ImportCandidateCard.vue'),
      'utf8'
    )

    expect(wrapper.text()).toContain('原始地点缺少教室信息')
    expect(wrapper.text()).toContain('需处理')
    expect(source).toMatch(/\.source-value\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/)
  })

  it('marks a resolvable location issue complete after an explicit mapping', () => {
    const wrapper = mount(ImportCandidateCard, {
      props: {
        candidate: {
          ...candidate,
          errors: [
            { code: 'room_missing', field: 'room_name', message: '原始地点缺少教室信息' }
          ]
        },
        buildings,
        resolution: { building_id: 3, room_name: '北区三层语言实验教室 301' },
        index: 1
      }
    })

    expect(wrapper.text()).toContain('映射已完整')
    expect(wrapper.text()).not.toContain('原始地点缺少教室信息')
  })
})
