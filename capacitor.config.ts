import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jls.financesuite',
  appName: 'JLS Finance Suite',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
