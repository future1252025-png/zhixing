import { build } from 'vite'
import { loadWebEnv, publicWebEnv, validateWebProductionEnv } from './validateWebProductionEnv.mjs'

const config = validateWebProductionEnv(loadWebEnv())
const exposed = publicWebEnv(config)
await build({
  mode: 'web',
  // Avoid exposing unrelated VITE_* values inherited from developers' env files.
  envPrefix: 'CAMPUSMIND_UNUSED_PUBLIC_PREFIX_',
  define: { 'import.meta.env': JSON.stringify(exposed),
    ...Object.fromEntries(Object.entries(exposed).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])) },
  plugins: [{
    name: 'campusmind-web-release-info',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'web-release.json', source: JSON.stringify({
        platform: 'web', apiUrl: config.apiUrl, amapServiceHost: config.amapServiceHost,
        commit: /^[0-9a-f]{7,40}$/i.test(process.env.CF_PAGES_COMMIT_SHA ?? '') ? process.env.CF_PAGES_COMMIT_SHA : null
      }, null, 2) })
    }
  }]
})
