import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BuildingPicker from './BuildingPicker.vue'

const buildings = [
  { id: 1, name: '湖北大学武昌校区图书馆', type: '公共学习区', description: '中心湖旁' },
  { id: 2, name: '逸夫楼', type: '教学楼', description: '东区教学区' },
  { id: 3, name: '实训大楼', type: '实训楼', description: '数据中国实验室' }
]

// jsdom 里 vant 组件不做按需注册，弹层用透传 slot 的 stub 代替
const stubs = {
  'van-popup': {
    props: ['show'],
    template: '<div class="popup-stub"><slot /></div>'
  }
}

function mountPicker(modelValue: number | null = null) {
  return mount(BuildingPicker, {
    props: { modelValue, buildings },
    global: { stubs }
  })
}

describe('BuildingPicker', () => {
  it('filters by name, type and description while counting visible results', async () => {
    const wrapper = mountPicker()

    await wrapper.get('.picker-trigger').trigger('click')
    await wrapper.get('.sheet-search input').setValue('实验室')

    const options = wrapper.findAll('.sheet-option')
    expect(options).toHaveLength(1)
    expect(options[0]!.text()).toContain('实训大楼')
    expect(wrapper.get('.sheet-count').text()).toBe('找到 1 个地点')
    expect(wrapper.find('.sheet-empty').exists()).toBe(false)
  })

  it('shows the empty state when no building matches the keyword', async () => {
    const wrapper = mountPicker()

    await wrapper.get('.picker-trigger').trigger('click')
    await wrapper.get('.sheet-search input').setValue('不存在的建筑')

    expect(wrapper.findAll('.sheet-option')).toHaveLength(0)
    expect(wrapper.get('.sheet-empty').text()).toContain('没有找到匹配的建筑')
  })

  it('emits the picked building id and closes the sheet', async () => {
    const wrapper = mountPicker()

    await wrapper.get('.picker-trigger').trigger('click')
    expect(wrapper.get('.picker-trigger').attributes('aria-expanded')).toBe('true')

    const target = wrapper
      .findAll('.sheet-option')
      .find((option) => option.text().includes('逸夫楼'))!
    await target.trigger('click')

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([2])
    expect(wrapper.get('.picker-trigger').attributes('aria-expanded')).toBe('false')
  })

  it('keeps the selected building visible on the trigger and inside filtered lists', async () => {
    const wrapper = mountPicker(2)

    expect(wrapper.get('.picker-trigger').text()).toContain('逸夫楼')

    await wrapper.get('.picker-trigger').trigger('click')
    await wrapper.get('.sheet-search input').setValue('实训')

    const texts = wrapper.findAll('.sheet-option').map((option) => option.text())
    expect(texts.some((text) => text.includes('实训大楼'))).toBe(true)
    // includeSelectedBuilding：已选建筑不因关键词过滤而消失
    expect(texts.some((text) => text.includes('逸夫楼'))).toBe(true)
  })

  it('associates the trigger with the visible field label', () => {
    const wrapper = mount(BuildingPicker, {
      props: { modelValue: null, buildings, labelledBy: 'building-field-label' },
      global: { stubs }
    })

    expect(wrapper.get('.picker-trigger').attributes('aria-labelledby'))
      .toBe('building-field-label')
  })
})
