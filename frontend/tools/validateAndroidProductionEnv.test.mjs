import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { validateProductionApiUrl } from './validateAndroidProductionEnv.mjs'

const frontendRoot = resolve(import.meta.dirname, '..')

describe('Android production build policy', () => {
  it('accepts only a public HTTPS API URL', () => {
    expect(validateProductionApiUrl('https://api.campusmind.cn/')).toBe(
      'https://api.campusmind.cn'
    )
    for (const value of [
      '',
      'http://api.campusmind.cn',
      'https://127.0.0.1:8000',
      'https://192.168.31.19:8000',
      'https://10.0.0.8',
      'https://service.local',
      'https://api.example.com',
      'https://api.campusmind.invalid',
      'https://user:pass@api.campusmind.cn',
      'https://api.campusmind.cn/#secret'
    ]) {
      expect(() => validateProductionApiUrl(value)).toThrow()
    }
  })

  it('keeps cleartext support confined to the explicit development command', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(frontendRoot, 'package.json'), 'utf8')
    )
    expect(packageJson.scripts['android:sync']).toContain(
      'CAPACITOR_ALLOW_MIXED_CONTENT=false'
    )
    expect(packageJson.scripts['android:sync']).toContain(
      'validateAndroidProductionEnv.mjs'
    )
    expect(packageJson.scripts['android:sync:dev']).toContain(
      'CAPACITOR_ALLOW_MIXED_CONTENT=true'
    )
  })

  it('disables Android application-data backup', () => {
    const manifest = readFileSync(
      resolve(frontendRoot, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    )
    expect(manifest).toContain('android:allowBackup="false"')
    expect(manifest).not.toContain('android:allowBackup="true"')
  })

  it('registers encrypted refresh-token storage backed by Android Keystore', () => {
    const activity = readFileSync(
      resolve(frontendRoot, 'android/app/src/main/java/com/campusmind/zhixing/MainActivity.java'),
      'utf8'
    )
    const secureSession = readFileSync(
      resolve(
        frontendRoot,
        'android/app/src/main/java/com/campusmind/zhixing/security/SecureSessionPlugin.java'
      ),
      'utf8'
    )

    expect(activity).toContain('registerPlugin(SecureSessionPlugin.class)')
    expect(secureSession).toContain('AndroidKeyStore')
    expect(secureSession).toContain('AES/GCM/NoPadding')
    expect(secureSession).toContain('cipher.updateAAD(AAD)')
  })
})
