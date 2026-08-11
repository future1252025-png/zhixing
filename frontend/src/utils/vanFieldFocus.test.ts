import { describe, expect, it, vi } from 'vitest'

import { installVanFieldFocusDelegation } from './vanFieldFocus'

describe('Vant field focus delegation', () => {
  it('focuses the editable control when label or field whitespace is clicked', () => {
    document.body.innerHTML = `
      <div class="van-field">
        <span class="van-field__label">账号</span>
        <div class="van-field__value"><input aria-label="账号" /></div>
      </div>`
    const dispose = installVanFieldFocusDelegation()
    const label = document.querySelector<HTMLElement>('.van-field__label')!
    const input = document.querySelector<HTMLInputElement>('input')!

    label.click()

    expect(document.activeElement).toBe(input)
    dispose()
  })

  it('does not hijack a dedicated action inside the field', () => {
    document.body.innerHTML = `
      <div class="van-field">
        <input />
        <button type="button">清空</button>
      </div>`
    const dispose = installVanFieldFocusDelegation()
    const focus = vi.spyOn(document.querySelector('input')!, 'focus')

    document.querySelector('button')!.click()

    expect(focus).not.toHaveBeenCalled()
    dispose()
  })
})
