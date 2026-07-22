import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { contrastRatio } from './contrast'

const styleSource = readFileSync(resolve(process.cwd(), 'src/styles/fresh.css'), 'utf8')

function colorToken(name: string): string {
  const match = styleSource.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Missing literal color token ${name}`)
  return match[1]
}

describe('readable color tokens', () => {
  it.each([
    ['#26362a', '#ffffff'],
    ['#26362a', '#f3f7f0'],
    ['#26362a', '#fff1d3'],
    ['#536657', '#ffffff']
  ])('keeps %s readable on %s', (foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps every declared text token readable on every declared light surface', () => {
    const textTokens = ['--text-primary', '--text-secondary']
    const surfaceTokens = ['--surface-page', '--surface-card', '--surface-mint', '--surface-sun']

    for (const text of textTokens) {
      for (const surface of surfaceTokens) {
        expect(
          contrastRatio(colorToken(text), colorToken(surface)),
          `${text} on ${surface}`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps disabled button labels readable instead of fading the whole control', () => {
    expect(
      contrastRatio(colorToken('--disabled-text'), colorToken('--disabled-surface'))
    ).toBeGreaterThanOrEqual(4.5)
    expect(styleSource).toContain('.van-button--disabled')
    expect(styleSource).toMatch(/\.van-button--disabled[\s\S]*?opacity:\s*1\s*!important/)
  })
})
