import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  validateProductionAndroidEnv,
  validateProductionApiUrl,
  validateProductionAmapKey,
  validateProductionAmapServiceHost
} from './validateAndroidProductionEnv.mjs'
import { verifyProductionBundle } from './verifyAndroidProductionBundle.mjs'

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
      'https://127.0.0.2:8000',
      'https://192.168.31.19:8000',
      'https://10.0.0.8',
      'https://100.64.0.1',
      'https://198.18.0.1',
      'https://[fd00::1]',
      'https://[fe80::1]',
      'https://service.local',
      'https://service.internal',
      'https://service.test',
      'https://api.example.com',
      'https://api.campusmind.invalid',
      'https://user:pass@api.campusmind.cn',
      'https://api.campusmind.cn/#secret'
    ]) {
      expect(() => validateProductionApiUrl(value)).toThrow()
    }
  })

  it('requires a non-placeholder AMap key and a public proxy endpoint', () => {
    expect(validateProductionAmapKey('0123456789abcdef0123456789abcdef')).toBe(
      '0123456789abcdef0123456789abcdef'
    )
    expect(
      validateProductionAmapServiceHost('https://app.campusmind.cn/_AMapService/')
    ).toBe('https://app.campusmind.cn/_AMapService')

    for (const key of ['', 'your-key', '0000000000000000', 'too-short']) {
      expect(() => validateProductionAmapKey(key)).toThrow()
    }
    for (const host of [
      'http://app.campusmind.cn/_AMapService',
      'https://app.example.com/_AMapService',
      'https://127.0.0.2/_AMapService',
      'https://app.campusmind.cn/not-amap'
    ]) {
      expect(() => validateProductionAmapServiceHost(host)).toThrow()
    }
  })

  it('rejects a production bundle that embeds the AMap security code', () => {
    expect(() => validateProductionAndroidEnv({
      VITE_API_BASE_URL: 'https://api.campusmind.cn',
      VITE_AMAP_KEY: '0123456789abcdef0123456789abcdef',
      VITE_AMAP_SECURITY_CODE: 'must-not-be-bundled',
      VITE_AMAP_SERVICE_HOST: 'https://app.campusmind.cn/_AMapService'
    })).toThrow(/VITE_AMAP_SECURITY_CODE/)
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
    expect(packageJson.scripts['android:sync']).toContain(
      'verifyAndroidProductionBundle.mjs'
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
    expect(manifest).toContain('android:usesCleartextTraffic="false"')
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

  it('enables Capacitor native HTTP so Axios requests are not blocked by WebView CORS', () => {
    const capacitorConfig = readFileSync(
      resolve(frontendRoot, 'capacitor.config.ts'),
      'utf8'
    )
    expect(capacitorConfig).toMatch(/CapacitorHttp:\s*\{[\s\S]*?enabled:\s*true/)
  })

  it('limits Android file sharing and academic-system navigation', () => {
    const manifest = readFileSync(
      resolve(frontendRoot, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    )
    const filePaths = readFileSync(
      resolve(frontendRoot, 'android/app/src/main/res/xml/file_paths.xml'),
      'utf8'
    )
    const hubuPolicy = readFileSync(
      resolve(
        frontendRoot,
        'android/app/src/main/java/com/campusmind/zhixing/hubu/HubuImportPolicy.java'
      ),
      'utf8'
    )
    expect(filePaths).not.toMatch(/external-path|external-files-path/)
    expect(filePaths).toContain('path="hubu-course-import/"')
    expect(manifest).toContain('android:allowBackup="false"')
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"')
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"')
    expect(hubuPolicy).toContain('ALLOWED_HOSTS.contains(normalizedHost)')
    expect(hubuPolicy).not.toContain('endsWith("." + OFFICIAL_DOMAIN)')
  })

  it('keeps CI release checks and publishable signing separate', () => {
    const ci = readFileSync(resolve(frontendRoot, '../.github/workflows/ci.yml'), 'utf8')
    const releaseWorkflow = readFileSync(
      resolve(frontendRoot, '../.github/workflows/android-release.yml'),
      'utf8'
    )
    const gradle = readFileSync(resolve(frontendRoot, 'android/app/build.gradle'), 'utf8')
    expect(ci).toContain('npm run android:sync')
    expect(ci).toMatch(/lintRelease assembleRelease bundleRelease/)
    expect(releaseWorkflow).toContain('ANDROID_REQUIRE_RELEASE_SIGNING:')
    expect(releaseWorkflow).toContain('bundleRelease')
    expect(releaseWorkflow).toContain('app-release.aab')
    expect(gradle).toContain("minifyEnabled true")
    expect(gradle).toContain("shrinkResources true")
    expect(gradle).toContain("verifyReleaseConfiguration")
  })

  it('preserves CodeQL results without requiring repository code scanning', () => {
    const codeql = readFileSync(
      resolve(frontendRoot, '../.github/workflows/codeql.yml'),
      'utf8'
    )
    expect(codeql).toContain('upload: never')
    expect(codeql).not.toContain('vars.CODEQL_UPLOAD_ENABLED')
    expect(codeql).toContain('upload-database: false')
    expect(codeql).toContain('actions/upload-artifact@v6')
  })

  it('reverse-checks the generated production bundle configuration', () => {
    const env = {
      VITE_API_BASE_URL: 'https://api.campusmind.cn',
      VITE_AMAP_KEY: '0123456789abcdef0123456789abcdef',
      VITE_AMAP_SECURITY_CODE: '',
      VITE_AMAP_SERVICE_HOST: 'https://app.campusmind.cn/_AMapService'
    }
    const config = {
      android: { allowMixedContent: false },
      plugins: { CapacitorHttp: { enabled: true } }
    }
    const bundleText = Object.values(env).join('\n')

    expect(() => verifyProductionBundle({ config, bundleText, env })).not.toThrow()
    expect(() => verifyProductionBundle({
      config: { ...config, android: { allowMixedContent: true } },
      bundleText,
      env
    })).toThrow(/mixed|\u6DF7合/i)
    expect(() => verifyProductionBundle({
      config,
      bundleText: bundleText.replace(env.VITE_API_BASE_URL, ''),
      env
    })).toThrow(/API/)
  })
})
