import type {CapacitorConfig} from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.onepair.p2p',
  appName: 'OnePair',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#120d14'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_heart',
      iconColor: '#e8577e'
    }
  }
}

export default config
