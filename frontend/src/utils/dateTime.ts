const TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i

export function parseApiDateTime(value: string): Date {
  const trimmedValue = value.trim()
  const isoValue = trimmedValue.includes(' ')
    ? trimmedValue.replace(' ', 'T')
    : trimmedValue
  const normalizedValue = TIMEZONE_SUFFIX.test(isoValue)
    ? isoValue
    : `${isoValue}Z`

  return new Date(normalizedValue)
}
