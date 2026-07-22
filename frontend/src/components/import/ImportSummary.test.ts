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
        conflicts: 1,
        ready: false
      }
    })

    expect(wrapper.text()).toContain('2026秋季完整课表.xlsx')
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('已解决')
    expect(wrapper.text()).toContain('待处理')
    expect(wrapper.text()).toContain('冲突')
    expect(wrapper.text()).toContain('请处理所有标记项后再导入')
  })

  it('states that every row passed validation when ready', () => {
    const wrapper = mount(ImportSummary, {
      props: {
        filename: 'schedule.htm',
        total: 2,
        resolved: 2,
        unresolved: 0,
        conflicts: 0,
        ready: true
      }
    })

    expect(wrapper.text()).toContain('全部校验通过')
  })
})
