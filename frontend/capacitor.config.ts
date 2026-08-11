import type { CapacitorConfig } from '@capacitor/cli';

const allowMixedContent = process.env.CAPACITOR_ALLOW_MIXED_CONTENT === 'true';

const config: CapacitorConfig = {
  appId: 'com.campusmind.zhixing',
  appName: '智行 CampusMind',
  webDir: 'dist',
  plugins: {
    // Native fetch/XMLHttpRequest avoids WebView CORS restrictions for the
    // public API. Axios keeps using its normal XHR adapter, while Capacitor
    // performs the request with Android's HTTPS stack.
    CapacitorHttp: {
      enabled: true
    }
  },
  android: {
    allowMixedContent
  }
};

export default config;
