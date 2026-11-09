import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import SemesterGate from './SemesterGate.vue'

async function createTestRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/courses/import', component: { template: '<div />' } },
      { path: '/profile/semester', component: { template: '<div />' } }
    ]
  })
  await router.push('/')
  await router.isReady()
  return router
}

describe('SemesterGate', () => {
  it('renders business content only for an active semester', async () => {
    const router = await createTestRouter()
    const wrapper = mount(SemesterGate, {
      props: { status: 'active', currentWeek: 4 },
      slots: { default: '<p>第 4 周真实课程</p>' },
      global: { plugins: [router] }
    })

    expect(wrapper.text()).toContain('第 4 周真实课程')
    expect(wrapper.find('.semester-gate').exists()).toBe(false)
  })

  it('links an unconfigured user to the import setup', async () => {
    const router = await createTestRouter()
    const wrapper = mount(SemesterGate, {
      props: { status: 'unconfigured' },
      global: { plugins: [router] }
    })

    expect(wrapper.text()).toContain('请先设置学期')
    expect(wrapper.get('a').attributes('href')).toBe('/courses/import')
  })

  it('supports distinct before-term and after-term content', async () => {
    const router = await createTestRouter()
    const before = mount(SemesterGate, {
      props: { status: 'before_term' },
      slots: { 'before-term': '<p>还没到开学日</p>' },
      global: { plugins: [router] }
    })
    const after = mount(SemesterGate, {
      props: { status: 'after_term' },
      slots: { 'after-term': '<p>教学周已经结束</p>' },
      global: { plugins: [router] }
    })

    expect(before.text()).toContain('还没到开学日')
    expect(after.text()).toContain('教学周已经结束')
  })
})
