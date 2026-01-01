import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.u19.textsync',
  appName: 'U19 Sender',
  webDir: 'build',
  server: {
    androidScheme: 'https',
    cleartext: true
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
      releaseType: 'APK'
    }
  }
};

export default config;
