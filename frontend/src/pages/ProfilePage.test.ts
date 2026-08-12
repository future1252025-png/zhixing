import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProfilePage from './ProfilePage.vue'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  replace: vi.fn(),
  showConfirmDialog: vi.fn(),
  showFailToast: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace })
}))

vi.mock('vant', () => ({
  showConfirmDialog: mocks.showConfirmDialog,
  showFailToast: mocks.showFailToast,
  showSuccessToast: vi.fn()
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    currentUser: {
      id: 1,
      student_id: '999999999999991',
      nickname: 'Alice',
      avatar_text: 'A',
      avatar_color: '#6f9474',
      role: 'student'
    },
    displayName: 'Alice',
    token: 'access-token',
    logout: mocks.logout,
    updateProfile: vi.fn(),
    loadCurrentUser: vi.fn()
  })
}))

vi.mock('@/stores/courses', () => ({
  useCoursesStore: () => ({ ensureLoaded: vi.fn().mockResolvedValue([]) })
}))

vi.mock('@/stores/semester', () => ({
  useSemesterStore: () => ({
    currentWeek: 1,
    semester: {},
    load: vi.fn()
  })
}))

describe('ProfilePage logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.showConfirmDialog.mockResolvedValue(undefined)
  })

  it('navigates to login after local logout even when server revocation is offline', async () => {
    mocks.logout.mockRejectedValue(new Error('offline'))
    const wrapper = mount(ProfilePage, {
      global: {
        directives: { reveal: {} },
        stubs: {
          TechIcon: true,
          'van-button': { template: '<button><slot /></button>' },
          'van-cell-group': { template: '<div><slot /></div>' },
          'van-field': { template: '<div><slot name="input" /></div>' },
          'van-nav-bar': { template: '<header />' },
          'van-popup': { template: '<div><slot /></div>' }
        }
      }
    })
    await flushPromises()

    await wrapper.get('.logout-button').trigger('click')
    await flushPromises()

    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.showFailToast).toHaveBeenCalledWith(
      '已从本机退出，服务端暂时未确认注销'
    )
    expect(mocks.replace).toHaveBeenCalledWith('/login')
  })

  it('shows one student identity row and a localized account role', async () => {
    const wrapper = mount(ProfilePage, {
      global: {
        directives: { reveal: {} },
        stubs: {
          TechIcon: true,
          'van-button': { template: '<button><slot /></button>' },
          'van-cell-group': { template: '<div><slot /></div>' },
          'van-field': { template: '<div><slot name="input" /></div>' },
          'van-nav-bar': { template: '<header />' },
          'van-popup': { template: '<div><slot /></div>' },
          'router-link': { template: '<a><slot /></a>' }
        }
      }
    })
    await flushPromises()

    expect(wrapper.get('.profile-copy h1').text()).toBe('Alice')
    expect(wrapper.get('.student-id-stat strong').text()).toBe('999999999999991')
    expect(wrapper.findAll('.account-list article')).toHaveLength(2)
    expect(wrapper.get('.student-identity-row').text()).toContain('学号')
    expect(wrapper.get('.student-identity-row').text()).toContain('用于登录智行')
    expect(wrapper.get('.account-list').text()).not.toContain('登录账号')
    expect(wrapper.get('.account-list').text()).not.toContain('相同')
    expect(wrapper.get('.account-list').text()).not.toContain('不同')
    expect(wrapper.get('.account-list').text()).toContain('学生')
    expect(wrapper.get('.account-list').text()).not.toContain('student')
  })
})
