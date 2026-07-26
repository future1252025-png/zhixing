import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BuildingMessage } from '@/api/messages'

import BuildingMessagesPage from './BuildingMessagesPage.vue'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  route: null as unknown as {
    params: Record<string, string>
    query: Record<string, string | undefined>
  },
  getBuildingDetail: vi.fn(),
  getBuildingMessages: vi.fn(),
  createBuildingMessage: vi.fn(),
  validateMessageContent: vi.fn(),
  showFailToast: vi.fn(),
  showSuccessToast: vi.fn()
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  mocks.route = reactive({ params: { id: '1' }, query: {} })
  return {
    useRoute: () => mocks.route,
    useRouter: () => ({ push: mocks.push })
  }
})

vi.mock('@/api/buildings', () => ({
  getBuildingDetail: mocks.getBuildingDetail
}))

vi.mock('@/api/messages', () => ({
  getBuildingMessages: mocks.getBuildingMessages,
  createBuildingMessage: mocks.createBuildingMessage,
  validateMessageContent: mocks.validateMessageContent
}))

vi.mock('@/utils/keyboardInset', async () => {
  const { ref } = await import('vue')
  return { useKeyboardInset: () => ({ keyboardInset: ref(0) }) }
})

vi.mock('vant', () => ({
  showFailToast: mocks.showFailToast,
  showSuccessToast: mocks.showSuccessToast
}))

const building = {
  id: 1,
  name: '综合教学楼',
  type: '教学楼',
  description: '上课地点',
  latitude: 30.59,
  longitude: 114.33,
  map_x: 0,
  map_y: 0,
  walk_hint: null
}

function message(id: number): BuildingMessage {
  return {
    id,
    building_id: 1,
    content: `message-${id}`,
    display_name: '匿名同学',
    room_name: null,
    created_at: '2026-07-07T08:00:00',
    latitude: null,
    longitude: null,
    location_source: null,
    distance_to_building_meters: null
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

async function mountPage() {
  const wrapper = mount(BuildingMessagesPage, {
    global: {
      stubs: {
        'van-nav-bar': { template: '<header />' },
        'van-empty': {
          props: ['description'],
          template: '<div class="van-empty">{{ description }}<slot /></div>'
        },
        'van-field': { template: '<label><slot name="input" /></label>' },
        'van-button': { template: '<button><slot /></button>' },
        TechIcon: { template: '<i />' }
      },
      directives: { reveal: {} }
    }
  })
  await flushPromises()
  return wrapper
}

describe('BuildingMessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.route.params.id = '1'
    delete mocks.route.query.room_name
    mocks.getBuildingDetail.mockResolvedValue(building)
    mocks.getBuildingMessages.mockResolvedValue([message(3)])
  })

  it('discards a stale first page when the room changes during loading', async () => {
    const firstLoad = deferred<BuildingMessage[]>()
    const secondLoad = deferred<BuildingMessage[]>()
    mocks.getBuildingMessages
      .mockReturnValueOnce(firstLoad.promise)
      .mockReturnValueOnce(secondLoad.promise)
    const wrapper = await mountPage()

    mocks.route.query.room_name = 'A203'
    await flushPromises()
    secondLoad.resolve([message(201)])
    await flushPromises()
    firstLoad.resolve([message(101)])
    await flushPromises()

    expect(mocks.getBuildingMessages).toHaveBeenCalledTimes(2)
    expect(mocks.getBuildingMessages).toHaveBeenLastCalledWith(1, {
      roomName: 'A203',
      limit: 50,
      offset: 0
    })
    expect(wrapper.text()).toContain('message-201')
    expect(wrapper.text()).not.toContain('message-101')
    wrapper.unmount()
  })

  it('requests older messages with the before_id of the oldest loaded message', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => message(51 + index))
    mocks.getBuildingMessages
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([message(3)])
    const wrapper = await mountPage()

    await wrapper.get('.load-more-button').trigger('click')
    await flushPromises()

    expect(mocks.getBuildingMessages).toHaveBeenLastCalledWith(1, {
      roomName: null,
      limit: 50,
      before_id: 51
    })
    expect(wrapper.text()).toContain('message-3')
    wrapper.unmount()
  })

  it('shows the FastAPI detail text when the page fails to load', async () => {
    mocks.getBuildingMessages.mockRejectedValueOnce({
      response: { status: 404, data: { detail: '建筑不存在' } }
    })
    const wrapper = await mountPage()

    expect(wrapper.get('.van-empty').text()).toContain('建筑不存在')
    wrapper.unmount()
  })

  it('maps a too-far detail to the friendly distance message', async () => {
    mocks.getBuildingMessages.mockRejectedValueOnce({
      response: { status: 403, data: { detail: 'Location is too far from the building' } }
    })
    const wrapper = await mountPage()

    expect(wrapper.get('.van-empty').text()).toContain(
      '当前位置距离该建筑过远，不能在这里留言'
    )
    wrapper.unmount()
  })
})
