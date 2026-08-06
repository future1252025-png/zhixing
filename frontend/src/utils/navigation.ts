import type { RouteLocationRaw, Router } from 'vue-router'

// 返回上一页统一走这里：vue-router 每次站内导航都会把来源写进 history.state.back，
// 有来源就 back() 出栈，避免 push 式返回不断叠高历史栈；
// 直链进入或新开标签页没有栈可回时，用 replace 兜底到该页信息层级的上一级。
export function goBack(router: Router, fallbackPath: RouteLocationRaw): void {
  const canGoBack = typeof window !== 'undefined' && Boolean(window.history.state?.back)
  if (canGoBack) {
    router.back()
    return
  }
  void router.replace(fallbackPath)
}
