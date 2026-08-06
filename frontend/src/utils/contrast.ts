function expandHex(value: string): string {
  const normalized = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return normalized.split('').map((character) => character.repeat(2)).join('')
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) return normalized
  throw new TypeError(`Unsupported hex color: ${value}`)
}

function relativeLuminance(hex: string): number {
  const value = expandHex(hex)
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  )
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

export function contrastRatio(foreground: string, background: string): number {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}
