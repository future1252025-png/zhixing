import '@amap/amap-jsapi-loader'

// The installed 1.0.1 runtime exports reset(), but omits it from index.d.ts.
declare module '@amap/amap-jsapi-loader' {
  export function reset(): void
}
