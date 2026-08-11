import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import {
  loadAndroidEnv,
  validateProductionAndroidEnv
} from './validateAndroidProductionEnv.mjs'

const frontendRoot = process.cwd()

export function verifyProductionBundle({ config, bundleText, env }) {
  const expected = validateProductionAndroidEnv(env)
  if (config?.android?.allowMixedContent !== false) {
    throw new Error('Android 正式产物仍允许混合内容。')
  }
  if (config?.plugins?.CapacitorHttp?.enabled !== true) {
    throw new Error('Android 正式产物未启用 CapacitorHttp 原生网络通道。')
  }
  for (const [label, value] of [
    ['API 地址', expected.apiUrl],
    ['高德 Key', expected.amapKey],
    ['高德代理地址', expected.amapServiceHost]
  ]) {
    if (!bundleText.includes(value)) {
      throw new Error(`Android 正式产物未包含已校验的${label}。`)
    }
  }
}

function readGeneratedBundle() {
  const configPath = resolve(
    frontendRoot,
    'android/app/src/main/assets/capacitor.config.json'
  )
  const assetsPath = resolve(frontendRoot, 'android/app/src/main/assets/public/assets')
  if (!existsSync(configPath) || !existsSync(assetsPath)) {
    throw new Error('尚未生成 Android 资源；请先执行 cap sync android。')
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const bundleText = readdirSync(assetsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => readFileSync(resolve(assetsPath, entry.name), 'utf8'))
    .join('\n')
  return { config, bundleText }
}

if (process.argv[1] && basename(process.argv[1]) === 'verifyAndroidProductionBundle.mjs') {
  try {
    verifyProductionBundle({
      ...readGeneratedBundle(),
      env: loadAndroidEnv()
    })
    process.stdout.write('Android 正式产物配置已通过反向校验。\n')
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
