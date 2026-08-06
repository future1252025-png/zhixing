import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SemesterSettingsCard from './SemesterSettingsCard.vue'

describe('SemesterSettingsCard', () => {
  it('shows the setup form when the semester is unconfigured', () => {
    const wrapper = mount(SemesterSettingsCard, {
      props: {
        semester: {
          status: 'unconfigured',
          start_date: null,
          total_weeks: null,
          current_week: null
        },
        saving: false
      }
    })

    expect(wrapper.text()).toContain('尚未设置学期，首页与出发建议暂不可用')
    expect(wrapper.find('[name="start_date"]').exists()).toBe(true)
    expect(wrapper.find('[name="total_weeks"]').exists()).toBe(true)
  })

  it('rejects a non-Monday start date before emitting save', async () => {
    const wrapper = mount(SemesterSettingsCard, {
      props: { semester: null, saving: false }
    })
    await wrapper.get('[name="start_date"]').setValue('2026-09-01')
    await wrapper.get('[name="total_weeks"]').setValue('20')

    await wrapper.get('form').trigger('submit')

    expect(wrapper.text()).toContain('学期开始日期必须是周一')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('keeps the saving label visible beside its spinner', () => {
    const wrapper = mount(SemesterSettingsCard, {
      props: { semester: null, saving: true }
    })

    expect(wrapper.get('.semester-save__label').text()).toBe('正在保存')
    expect(wrapper.find('.semester-save__spinner').exists()).toBe(true)
    expect(wrapper.get('.semester-save__label').find('.semester-save__spinner').exists()).toBe(
      false
    )
  })

  it('states the real current week only for an active semester', () => {
    const wrapper = mount(SemesterSettingsCard, {
      props: {
        semester: {
          status: 'active',
          start_date: '2026-08-31',
          total_weeks: 20,
          current_week: 4
        },
        saving: false
      }
    })

    expect(wrapper.text()).toContain('真实当前周：第 4 周')
  })

  it.each([
    ['before_term', '学期尚未开始'],
    ['after_term', '本学期已结束']
  ] as const)('does not invent a current week for %s', (status, label) => {
    const wrapper = mount(SemesterSettingsCard, {
      props: {
        semester: {
          status,
          start_date: '2026-08-31',
          total_weeks: 20,
          current_week: null
        },
        saving: false
      }
    })

    expect(wrapper.text()).toContain(label)
    expect(wrapper.text()).not.toContain('真实当前周')
  })

  it('restores existing values when editing', async () => {
    const wrapper = mount(SemesterSettingsCard, {
      props: {
        semester: {
          status: 'active',
          start_date: '2026-08-31',
          total_weeks: 20,
          current_week: 4
        },
        saving: false
      }
    })

    await wrapper.get('[data-testid="edit-semester"]').trigger('click')

    expect((wrapper.get('[name="start_date"]').element as HTMLInputElement).value).toBe(
      '2026-08-31'
    )
    expect((wrapper.get('[name="total_weeks"]').element as HTMLInputElement).value).toBe(
      '20'
    )
  })
})
