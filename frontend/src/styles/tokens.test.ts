import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { palette, vantThemeVars } from './tokens'

// vitest 的 CSS 处理会把 `?raw` 导入吞成空串，这里直接读源文件（cwd = frontend/）
const freshCss = readFileSync(join(process.cwd(), 'src/styles/fresh.css'), 'utf8')

describe('design tokens 同源性', () => {
  it('palette 中每个 hex 都必须出现在 fresh.css，防止 JS/CSS 两侧漂移', () => {
    const css = freshCss.toLowerCase()
    for (const [name, hex] of Object.entries(palette)) {
      expect(css.includes(hex.toLowerCase()), `palette.${name} = ${hex} 未在 fresh.css 中出现`).toBe(
        true
      )
    }
  })

  it('themeVars 的颜色值全部来自 palette，不允许游离 hex', () => {
    const allowed = new Set<string>([...Object.values(palette), 'transparent'])
    for (const [name, value] of Object.entries(vantThemeVars)) {
      if (typeof value === 'string' && value.startsWith('#')) {
        expect(allowed.has(value), `themeVars.${name} = ${value} 不在 palette 中`).toBe(true)
      }
    }
  })
})
