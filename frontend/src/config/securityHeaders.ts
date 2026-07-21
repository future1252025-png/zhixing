export const SPA_SECURITY_HEADERS = {
  'Content-Security-Policy': 'frame-ancestors \'none\'',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
} as const
