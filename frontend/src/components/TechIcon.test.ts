import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TechIcon from './TechIcon.vue'

type IconName = InstanceType<typeof TechIcon>['$props']['name']

// 全量图标名：新增图标必须同步加入，防止 name 落进 spark 兜底分支
const names: IconName[] = [
  'orbit', 'calendar', 'route', 'user', 'scan', 'upload', 'arrow', 'spark',
  'aim', 'chevron-down', 'to-top', 'certificate', 'chat', 'contact', 'close',
  'edit', 'flag', 'guide', 'location', 'notes', 'plus', 'refresh', 'check',
  'home', 'users'
]

describe('TechIcon', () => {
  it('renders distinct stroke shapes for every icon name', () => {
    const rendered = new Map<string, string>()
    for (const name of names) {
      const wrapper = mount(TechIcon, { props: { name } })
      const svg = wrapper.find('svg.tech-icon')
      expect(svg.exists(), name).toBe(true)
      const shapes = svg.element.querySelectorAll('path, circle, ellipse, rect')
      expect(shapes.length, name).toBeGreaterThan(0)
      rendered.set(name, svg.element.innerHTML)
    }
    // 每个 name 都要有自己的图形，不允许两个名字画出同一份内容
    expect(new Set(rendered.values()).size).toBe(names.length)
  })

  it('respects the size prop and keeps the 24 viewBox with currentColor strokes', () => {
    const wrapper = mount(TechIcon, { props: { name: 'aim', size: 16 } })
    const svg = wrapper.find('svg.tech-icon')
    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('height')).toBe('16')
    expect(svg.attributes('viewBox')).toBe('0 0 24 24')
    expect(svg.attributes('fill')).toBe('none')
  })
})
