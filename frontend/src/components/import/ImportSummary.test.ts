import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ImportSummary from './ImportSummary.vue'

describe('ImportSummary', () => {
  it('shows file, totals, unresolved rows and explicit blocking reason', () => {
    const wrapper = mount(ImportSummary, {
      props: {
        filename: '2026秋季完整课表.xlsx',
        total: 5,
        resolved: 3,
        unresolved: 2,
        pending: 0,
        conflicts: 1,
        ready: false
      }
    })

    expect(wrapper.text()).toContain('2026秋季完整课表.xlsx')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('可导入')
    expect(wrapper.text()).toContain('解析异常')
    expect(wrapper.text()).toContain('冲突')
    expect(wrapper.text()).toContain('部分课程的时间等核心信息无法识别')
  })

  it('states that every row passed validation when ready', () => {
    const wrapper = mount(ImportSummary, {
      props: {
        filename: 'schedule.htm',
        total: 2,
        resolved: 2,
        unresolved: 0,
        pending: 0,
        conflicts: 0,
        ready: true
      }
    })

    expect(wrapper.text()).toContain('核心排课信息完整，可以整批导入')
  })

  it('describes importable rows with missing details as pending completion', () => {
    const wrapper = mount(ImportSummary, {
      props: {
        filename: 'schedule.htm',
        total: 2,
        resolved: 2,
        unresolved: 0,
        pending: 1,
        conflicts: 0,
        ready: true
      }
    })

    expect(wrapper.text()).toContain('可以整批导入')
    expect(wrapper.text()).toContain('1 门课程之后可继续补全')
  })
})
