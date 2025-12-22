import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jls.suite',
  appName: 'JLS Suite',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#1e1b4b',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'Dark',
      backgroundColor: '#ffffff'
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
