import { describe, expect, it } from 'vitest'
import { validateWebProductionEnv, publicWebEnv } from './validateWebProductionEnv.mjs'
import { verifyWebProductionBundle } from './verifyWebProductionBundle.mjs'

const env = { VITE_API_BASE_URL: 'https://api.campusmindapp.com', VITE_AMAP_KEY: 'valid_amap_key_for_tests',
  VITE_AMAP_SERVICE_HOST: 'https://campusmindapp.com/_AMapService', VITE_AMAP_SECURITY_CODE: '' }

describe('production web configuration', () => {
  it('allows only explicitly selected public fields into the client', () => {
    const result = publicWebEnv(validateWebProductionEnv({ ...env, VITE_PRIVATE_TOKEN: 'never-leak', AMAP_SECURITY_CODE: 'server-only' }))
    expect(result.VITE_API_BASE_URL).toBe(env.VITE_API_BASE_URL)
    expect(result.DEV).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/never-leak|server-only/)
  })
  it.each(['', '/', 'http://127.0.0.1:8000', 'https://test.pages.dev', 'https://api.campusmindapp.com.evil.invalid', 'https://api.campusmindapp.com/?secret=x'])('rejects wrong API: %s', value => {
    expect(() => validateWebProductionEnv({ ...env, VITE_API_BASE_URL: value })).toThrow()
  })
  it('requires a proxy and forbids embedding map secrets', () => {
    expect(() => validateWebProductionEnv({ ...env, VITE_AMAP_SERVICE_HOST: '' })).toThrow()
    expect(() => validateWebProductionEnv({ ...env, VITE_AMAP_SECURITY_CODE: 'sensitive-value' })).toThrow()
    expect(() => validateWebProductionEnv({ ...env, VITE_AMAP_KEY: '' })).toThrow()
  })
  it('checks generated config, missing values and accidental secret exposure', () => {
    const config = validateWebProductionEnv(env)
    const release = { platform: 'web', apiUrl: config.apiUrl, amapServiceHost: config.amapServiceHost }
    const bundleText = Object.values(config).join(' ')
    expect(() => verifyWebProductionBundle({ release, bundleText, env })).not.toThrow()
    expect(() => verifyWebProductionBundle({ release: { ...release, apiUrl: '/' }, bundleText, env })).toThrow()
    expect(() => verifyWebProductionBundle({ release, bundleText: '', env })).toThrow()
    expect(() => verifyWebProductionBundle({ release, bundleText: bundleText + 'sensitive_secret', env, forbiddenSecrets: ['sensitive_secret'] })).toThrow()
  })
})
