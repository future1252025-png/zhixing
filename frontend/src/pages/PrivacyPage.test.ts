import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import PrivacyPage from './PrivacyPage.vue'

const back = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ back })
}))

describe('PrivacyPage', () => {
  it('explains account, timetable, location and deletion choices', async () => {
    const wrapper = mount(PrivacyPage, {
      global: {
        stubs: {
          'van-nav-bar': {
            emits: ['click-left'],
            template: '<button type="button" @click="$emit(\'click-left\')">返回</button>'
          },
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    })

    expect(wrapper.text()).toContain('智行如何使用信息')
    expect(wrapper.text()).toContain('不在频道响应或数据库中保留本次精确坐标')
    expect(wrapper.text()).toContain('永久删除账号')

    await wrapper.get('button').trigger('click')
    expect(back).toHaveBeenCalledOnce()
  })
})
