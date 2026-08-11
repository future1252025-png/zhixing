const EDITABLE_SELECTOR = [
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[contenteditable="true"]',
  'button:not([disabled])'
].join(',')

/**
 * Vant 的 Field 把留白和 label 放在真实 input 外侧。触屏用户点到这些区域时，
 * 统一把焦点交给字段中的编辑控件，让整行都能可靠唤起光标/键盘。
 */
export function installVanFieldFocusDelegation(root: Document = document): () => void {
  const handleClick = (event: MouseEvent) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const field = target.closest<HTMLElement>('.van-field')
    if (!field || field.getAttribute('aria-disabled') === 'true') return

    const control = field.querySelector<HTMLElement>(EDITABLE_SELECTOR)
    if (!control || target === control || control.contains(target)) return
    // 不夺走字段内显式按钮/链接自己的交互；例如清空、密码可见性与建筑选择。
    if (target.closest('button, a, [role="button"]')) return
    control.focus()
  }

  root.addEventListener('click', handleClick)
  return () => root.removeEventListener('click', handleClick)
}
