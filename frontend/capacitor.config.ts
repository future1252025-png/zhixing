import type { CapacitorConfig } from '@capacitor/cli';

const allowMixedContent = process.env.CAPACITOR_ALLOW_MIXED_CONTENT === 'true';

const config: CapacitorConfig = {
  appId: 'com.campusmind.zhixing',
  appName: '智行 CampusMind',
  webDir: 'dist',
  android: {
    allowMixedContent
  }
};

export default config;
