import { basename, resolve } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { loadEnv } from 'vite'
import { loadWebEnv, validateWebProductionEnv } from './validateWebProductionEnv.mjs'

export function verifyWebProductionBundle({ release, bundleText, env, forbiddenSecrets = [] }) {
  const expected = validateWebProductionEnv(env)
  if (release.platform !== 'web' || release.apiUrl !== expected.apiUrl || release.amapServiceHost !== expected.amapServiceHost) {
    throw new Error('网页发布配置与构建结果不一致')
  }
  for (const value of Object.values(expected)) {
    if (!bundleText.includes(value)) throw new Error('网页产物缺少已校验的正式配置')
  }
  for (const secret of forbiddenSecrets.filter(value => typeof value === 'string' && value.length >= 8)) {
    if (bundleText.includes(secret) || bundleText.includes(encodeURIComponent(secret))) throw new Error('网页产物包含服务端密钥，禁止发布')
  }
}

function generatedText(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? generatedText(path)
      : /\.(js|json|html|map|webmanifest)$/.test(entry.name) ? [readFileSync(path, 'utf8')] : []
  })
}

if (process.argv[1] && basename(process.argv[1]) === 'verifyWebProductionBundle.mjs') {
  try {
    const env = loadWebEnv(), root = process.cwd()
    verifyWebProductionBundle({
      release: JSON.parse(readFileSync(resolve(root, 'dist/web-release.json'), 'utf8')),
      bundleText: generatedText(resolve(root, 'dist')).join('\n'), env,
      forbiddenSecrets: [env.AMAP_SECURITY_CODE, env.CLOUDFLARE_API_TOKEN,
        loadEnv('development', root, '').VITE_AMAP_SECURITY_CODE,
        loadEnv('android', root, '').VITE_AMAP_SECURITY_CODE]
    })
    const routes = JSON.parse(readFileSync(resolve(root, 'dist/_routes.json'), 'utf8'))
    if (JSON.stringify(routes.include) !== JSON.stringify(['/*'])
      || !['/assets/*', '/icons/*', '/manifest.webmanifest', '/web-release.json'].every(path => routes.exclude?.includes(path))) {
      throw new Error('Functions 路由未正确排除静态资源')
    }
    console.log('网页产物校验通过：正式配置正确，未发现已知服务端密钥。')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
