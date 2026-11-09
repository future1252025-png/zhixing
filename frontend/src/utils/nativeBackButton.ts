import { App as CapacitorApp, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { showToast } from 'vant'
import type { RouteLocationRaw, Router } from 'vue-router'

const EXIT_CONFIRM_WINDOW_MS = 2_000

const ROOT_PATHS = new Set([
  '/home',
  '/courses',
  '/schedule',
  '/reminders',
  '/profile',
  '/login'
])

export type NativeBackAction =
  | { kind: 'back' }
  | { kind: 'fallback'; target: RouteLocationRaw }
  | { kind: 'confirm-exit' }
  | { kind: 'exit' }

type NativeAppBridge = {
  addListener(
    eventName: 'backButton',
    listener: (event: BackButtonListenerEvent) => void | Promise<void>
  ): Promise<PluginListenerHandle>
  exitApp(): Promise<void>
}

type NativeBackButtonOptions = {
  app?: NativeAppBridge
  isAndroid?: boolean
  now?: () => number
  notify?: (message: string) => void
  exitConfirmWindowMs?: number
}

export function nativeBackFallback(path: string): RouteLocationRaw | null {
  if (path === '/register') return '/login'
  if (path === '/privacy') return '/profile'
  if (path === '/map-collector') return '/home'
  if (/^\/courses\/(?:new|import|[^/]+\/edit)$/.test(path)) return '/courses'

  const chatroomMatch = path.match(/^\/buildings\/([^/]+)\/chats$/)
  if (chatroomMatch) return `/buildings/${chatroomMatch[1]}`

  const messagesMatch = path.match(/^\/buildings\/([^/]+)\/messages$/)
  if (messagesMatch) return `/buildings/${messagesMatch[1]}/chats`

  if (/^\/buildings\/[^/]+$/.test(path)) return '/home'
  return null
}

export function resolveNativeBackAction(
  path: string,
  canGoBack: boolean,
  exitConfirmationActive: boolean
): NativeBackAction {
  if (ROOT_PATHS.has(path)) {
    return exitConfirmationActive ? { kind: 'exit' } : { kind: 'confirm-exit' }
  }

  if (canGoBack) return { kind: 'back' }

  const fallback = nativeBackFallback(path)
  return fallback ? { kind: 'fallback', target: fallback } : { kind: 'confirm-exit' }
}

export async function installAndroidBackButton(
  router: Router,
  options: NativeBackButtonOptions = {}
): Promise<PluginListenerHandle | undefined> {
  const isAndroid = options.isAndroid ?? (
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
  )
  if (!isAndroid) return undefined

  const app = options.app ?? CapacitorApp
  const now = options.now ?? Date.now
  const notify = options.notify ?? ((message: string) => {
    showToast({ message, position: 'bottom', duration: 1_800 })
  })
  const confirmWindow = options.exitConfirmWindowMs ?? EXIT_CONFIRM_WINDOW_MS
  let lastExitPromptAt: number | null = null
  let handling = false

  const removeRouteReset = router.afterEach(() => {
    lastExitPromptAt = null
  })

  const nativeHandle = await app.addListener('backButton', async ({ canGoBack }) => {
    if (handling) return
    handling = true

    try {
      const currentTime = now()
      const exitConfirmationActive = lastExitPromptAt !== null &&
        currentTime - lastExitPromptAt <= confirmWindow
      const hasRouterOrigin = typeof window !== 'undefined' && Boolean(window.history.state?.back)
      const action = resolveNativeBackAction(
        router.currentRoute.value.path,
        canGoBack || hasRouterOrigin,
        exitConfirmationActive
      )

      if (action.kind === 'back') {
        lastExitPromptAt = null
        router.back()
        return
      }
      if (action.kind === 'fallback') {
        lastExitPromptAt = null
        await router.replace(action.target)
        return
      }
      if (action.kind === 'exit') {
        lastExitPromptAt = null
        await app.exitApp()
        return
      }

      lastExitPromptAt = currentTime
      notify('再次点击返回键回到桌面')
    } finally {
      handling = false
    }
  })

  return {
    remove: async () => {
      removeRouteReset()
      await nativeHandle.remove()
    }
  }
}
