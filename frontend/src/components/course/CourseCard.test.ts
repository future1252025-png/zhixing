import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { Course } from '@/types/course'

import CourseCard from './CourseCard.vue'

const course: Course = {
  id: 17,
  course_name: '计算机组成原理',
  weekday: 1,
  start_time: '08:00',
  end_time: '09:40',
  building_id: 4,
  building: {
    id: 4,
    name: '湖北大学（武昌校区）逸夫人文楼',
    type: '教学楼'
  },
  room_name: '北区三层东侧联合创新实验教室 A-301（临时调整）',
  source_location: '逸夫人文楼北区三层东侧联合创新实验教室 A-301（临时调整）',
  teacher: '罗老师',
  weeks: '1-16（单周）',
  source_kind: 'import',
  needs_location_review: false,
  created_at: '2026-07-21T08:00:00'
}

describe('CourseCard', () => {
  it('shows the full building and classroom as one exact readable location', () => {
    const wrapper = mount(CourseCard, { props: { course } })
    const location = wrapper.get('[data-testid="course-location"]')
    const expected = course.source_location!

    expect(location.get('span:last-child').text()).toBe(expected)
    expect(location.attributes('title')).toBe(expected)
  })

  it('keeps imported source, weeks, teacher and time visible', () => {
    const wrapper = mount(CourseCard, { props: { course } })

    expect(wrapper.text()).toContain('导入课程')
    expect(wrapper.text()).toContain('1-16（单周）')
    expect(wrapper.text()).toContain('罗老师')
    expect(wrapper.text()).toContain('08:00—09:40')
  })

  it('keeps the source location visible without interrupting ordinary viewing', () => {
    const wrapper = mount(CourseCard, {
      props: {
        course: {
          ...course,
          building_id: null,
          building: null,
          room_name: '待确认教室',
          needs_location_review: true
        }
      }
    })

    expect(wrapper.get('[data-testid="course-location"]').text()).toContain(course.source_location)
    expect(wrapper.find('.course-card__review').exists()).toBe(false)
    expect(wrapper.find('[data-testid="repair-location"]').exists()).toBe(false)
  })

  it('wraps long locations instead of clipping them with an ellipsis', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/course/CourseCard.vue'), 'utf8')

    expect(source).toMatch(/\.course-card__location\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/)
    expect(source).not.toMatch(/\.course-card__location\s*\{[\s\S]*?text-overflow:\s*ellipsis;/)
    expect(source).not.toMatch(/\.course-card__location\s*\{[\s\S]*?white-space:\s*nowrap;/)
  })
})
